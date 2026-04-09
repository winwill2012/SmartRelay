/**
 * SmartRelay ESP32-C3 固件
 *
 * 《协议标准.md》§3 MQTT：下行 sr/v1/device/{device_id}/cmd、ota；
 *   上行 ack、report、ota/progress；遗嘱 lwt Retain。
 * §4 JSON：cmd_id、type(relay.set|relay.toggle|ota.start|schedule.sync|ping)、ack、report。
 * §7 BLE：Service 0xFFF0，RX 0xFFF1，TX 0xFFF2；wifi.set / wifi.result / device.info / bind.prepare。
 * §8 OTA：HTTPS 拉取，MD5 校验，cmd ota.start。
 *
 * 硬件：继电器 IO4 低有效；LED IO8；BOOT(IO9) 长按 5s 清除 WiFi。
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_mac.h>
#include <esp_task_wdt.h>
#include <esp_timer.h>
#include <mbedtls/md5.h>
#include <cstring>
#include <cstdlib>
#include <strings.h>
#include <nvs_flash.h>
#include <nvs.h>
#include <time.h>

#include <MQTT.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>

#include "config.h"

// ---- §7 GATT UUID（与协议一致，全项目统一）----
static const char *kBleSvc = "0000fff0-0000-1000-8000-00805f9b34fb";
static const char *kBleRx = "0000fff1-0000-1000-8000-00805f9b34fb";
static const char *kBleTx = "0000fff2-0000-1000-8000-00805f9b34fb";

static String gDeviceId;
static String gBleName;

static NimBLEServer *gBleServer = nullptr;
static NimBLECharacteristic *gBleTx = nullptr;
static bool gBleActive = false;

static WiFiClient gWifiTcp;
static MQTTClient gMqtt(8192);

static bool gRelayOn = false;
static int64_t gScheduleRevision = 0;
static String gSchedulesJson = "[]";

static String gRxBleBuf;
static String gRxPlainAccum;

/** WiFi 配网不得在 BLE 写回调里长时间阻塞，否则 NimBLE 无法收发包，手机收不到 wifi.result */
static String gProvWifiSsid;
static String gProvWifiPass;
static volatile bool gProvWifiPending = false;
static volatile bool gProvWifiRunning = false;
static uint32_t gProvSeq = 0;
static unsigned long gProvStartMs = 0;
static unsigned long gLastHeartbeat = 0;
static unsigned long gLastWifiHealTry = 0;
static int gWifiHealAttempt = 0;
static unsigned long gLastWifiStateLog = 0;
static int gLastWifiStatus = -999;
static unsigned long gLastMqttReconnectTry = 0;
static unsigned long gLastMqttLoopFailLog = 0;
static int gMqttFailStreak = 0;
static bool gPrevWifiConnected = false;
static unsigned long gMqttOfflineSince = 0;
static bool gPrevMqttConnected = false;
static unsigned long gBootPressStart = 0;

static volatile bool gOtaBusy = false;

// ---- Topic 构造：sr/v1/device/{device_id}/<suffix> §3 ----
static String tCmd() { return "sr/v1/device/" + gDeviceId + "/cmd"; }
static String tOta() { return "sr/v1/device/" + gDeviceId + "/ota"; }
static String tAck() { return "sr/v1/device/" + gDeviceId + "/ack"; }
static String tReport() { return "sr/v1/device/" + gDeviceId + "/report"; }
static String tOtaProg() { return "sr/v1/device/" + gDeviceId + "/ota/progress"; }
static String tLwt() { return "sr/v1/device/" + gDeviceId + "/lwt"; }

static String mqttClientId() {
  String id = "sr_";
  for (unsigned i = 0; i < gDeviceId.length(); i++) {
    char c = gDeviceId[i];
    if (isalnum((unsigned char)c))
      id += c;
    else
      id += '_';
  }
  return id;
}

static int64_t nowMs() { return (int64_t)esp_timer_get_time() / 1000; }

static void logProv(uint32_t seq, const char *stage, const char *detail = nullptr) {
  if (detail && detail[0]) {
    Serial.printf("[PROV#%lu][%lu ms][%s] %s\n", (unsigned long)seq, millis(), stage, detail);
  } else {
    Serial.printf("[PROV#%lu][%lu ms][%s]\n", (unsigned long)seq, millis(), stage);
  }
}

// ---------- NVS ----------
static const char *kNvs = "sr";

static bool nvsGetStr(const char *key, String &out) {
  nvs_handle_t h;
  if (nvs_open(kNvs, NVS_READONLY, &h) != ESP_OK)
    return false;
  size_t sz = 0;
  if (nvs_get_str(h, key, nullptr, &sz) != ESP_OK || sz == 0) {
    nvs_close(h);
    return false;
  }
  char *buf = (char *)malloc(sz);
  if (!buf) {
    nvs_close(h);
    return false;
  }
  nvs_get_str(h, key, buf, &sz);
  out = String(buf);
  free(buf);
  nvs_close(h);
  return true;
}

static void nvsSetStr(const char *key, const String &val) {
  nvs_handle_t h;
  if (nvs_open(kNvs, NVS_READWRITE, &h) != ESP_OK)
    return;
  nvs_set_str(h, key, val.c_str());
  nvs_commit(h);
  nvs_close(h);
}

static void nvsEraseKey(const char *key) {
  nvs_handle_t h;
  if (nvs_open(kNvs, NVS_READWRITE, &h) != ESP_OK)
    return;
  nvs_erase_key(h, key);
  nvs_commit(h);
  nvs_close(h);
}

static void clearWifiCredentials() {
  nvsEraseKey("wifi_ssid");
  nvsEraseKey("wifi_pass");
}

// ---------- 继电器 §4 relay_on 逻辑；硬件低有效 ----------
static void applyRelay(bool on) {
  gRelayOn = on;
  digitalWrite(PIN_RELAY, on ? LOW : HIGH);
}

// ---------- LED：配网快闪 / MQTT 呼吸 ----------
enum LedMode { LED_PROVISION, LED_BREATH };

static LedMode gLedMode = LED_PROVISION;
static const int kLedcCh = 0;

static void ledInit() {
  pinMode(PIN_LED, OUTPUT);
  ledcSetup(kLedcCh, 5000, 10);
  ledcAttachPin(PIN_LED, kLedcCh);
}

static void setLedMode(LedMode m) {
  gLedMode = m;
}

static void ledLoop() {
  if (gLedMode == LED_PROVISION) {
    static uint32_t t0 = 0;
    uint32_t m = millis();
    if (m - t0 > 200) {
      t0 = m;
      static bool on = false;
      on = !on;
      ledcWrite(kLedcCh, on ? 1023 : 0);
    }
  } else {
    float ph = millis() / 2500.0f * 2.0f * 3.1415926f;
    int duty = (int)((sin(ph) * 0.5f + 0.5f) * 900) + 50;
    ledcWrite(kLedcCh, duty);
  }
}

// ---------- 时间（定时任务 Asia/Shanghai §6）----------
static void syncTime() {
  configTime(8 * 3600, 0, "ntp.aliyun.com", "pool.ntp.org", "time.windows.com");
}

// ---------- BLE 分帧发送 §7 ----------
static void bleNotifyJson(const JsonDocument &doc) {
  if (!gBleTx) {
    Serial.println("[BLE TX] skip notify: gBleTx is null");
    return;
  }
  String json;
  serializeJson(doc, json);
  Serial.printf("[BLE TX] notify json_len=%u payload=%s\n", (unsigned)json.length(), json.c_str());
  const size_t mtuPayload = 244;
  size_t off = 0;
  uint8_t seq = 0;
  while (off < json.length()) {
    size_t chunk = json.length() - off;
    if (chunk > mtuPayload - 2)
      chunk = mtuPayload - 2;
    bool last = (off + chunk >= (size_t)json.length());
    uint8_t buf[256];
    buf[0] = seq++;
    buf[1] = last ? 1 : 0;
    memcpy(buf + 2, json.c_str() + off, chunk);
    gBleTx->setValue(buf, 2 + chunk);
    Serial.printf("[BLE TX] chunk seq=%u last=%d bytes=%u\n", (unsigned)buf[0], last ? 1 : 0,
                  (unsigned)(2 + chunk));
    gBleTx->notify();
    off += chunk;
    delay(10);
  }
}

/** 联调：打印收到的 WiFi 名称与密码（勿用于量产泄露场景） */
static void serialPrintWifiParams(const char *tag, const char *ssid, const char *pass) {
  Serial.printf("\n[WiFi] %s —— 解析到的凭证 ——\n", tag);
  Serial.print("  ssid     : ");
  Serial.println(ssid ? ssid : "(null)");
  Serial.printf("  ssid_len : %u\n", ssid ? (unsigned)strlen(ssid) : 0);
  Serial.print("  password : ");
  Serial.println(pass ? pass : "");
  Serial.printf("  pass_len : %u\n", pass ? (unsigned)strlen(pass) : 0);
  if (pass && pass[0]) {
    Serial.print("  pass_hex : ");
    size_t n = strlen(pass);
    if (n > 48)
      n = 48;
    for (size_t i = 0; i < n; i++)
      Serial.printf("%02X ", (unsigned char)pass[i]);
    if (strlen(pass) > 48)
      Serial.print("...");
    Serial.println();
  }
  Serial.println("[WiFi] ————————————————\n");
}

static const char *wifiStatusName(int s) {
  switch (s) {
  case WL_IDLE_STATUS:
    return "WL_IDLE(0)";
  case WL_NO_SSID_AVAIL:
    return "WL_NO_SSID_AVAIL(1)";
  case WL_SCAN_COMPLETED:
    return "WL_SCAN_COMPLETED(2)";
  case WL_CONNECTED:
    return "WL_CONNECTED(3)";
  case WL_CONNECT_FAILED:
    return "WL_CONNECT_FAILED(4)";
  case WL_CONNECTION_LOST:
    return "WL_CONNECTION_LOST(5)";
  case WL_DISCONNECTED:
    return "WL_DISCONNECTED(6)";
  default:
    return "?";
  }
}

static void runWifiProvisioning(const char *ssid, const char *pass) {
  uint32_t provSeq = ++gProvSeq;
  gProvStartMs = millis();
  gProvWifiRunning = true;
  logProv(provSeq, "START", "enter runWifiProvisioning");
  serialPrintWifiParams("runProvisioning(即将连网)", ssid, pass);

  /* 1) 暂停 BLE 广播，减轻与 STA 同频干扰（GATT 连接可保持） */
  logProv(provSeq, "BLE", "stopAdvertising");
  NimBLEDevice::stopAdvertising();
  delay(120);

  /* 2) 勿使用 WiFi.mode(WIFI_OFF)：与 BLE 共存时易触发 wifi:timeout when WiFi un-init */
  WiFi.disconnect(false);
  delay(300);
  WiFi.mode(WIFI_STA);
  delay(200);
  /*
   * WiFi 与 BLE 同时存在时，ESP-IDF 要求必须开启 WiFi modem sleep，
   * 否则运行时会 abort：「Should enable WiFi modem sleep when both WiFi and Bluetooth are enabled」。
   * 切勿在此处 WiFi.setSleep(false)。
   */
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  logProv(provSeq, "WIFI", "mode=STA sleep=on autoreconnect=on");
  delay(100);

  /*
   * 3) 预扫描：仅用于记录/备用 BSSID，不先 pin（先 pin 在双频同名/Mesh 上常失败）。
   *    同名多 AP 时取 2.4G（信道 1–14）中 RSSI 最强的一条。
   */
  int32_t useCh = 0;
  uint8_t bssid[6] = {0};
  bool haveBssid = false;
  int bestRssi = -128;
  Serial.println("[WiFi] pre-scan (pick 2.4G BSSID for fallback)…");
  int16_t n = WiFi.scanNetworks(false, true, false, 120);
  Serial.printf("[WiFi] scan n=%d\n", (int)n);
  for (int i = 0; i < n; i++) {
    if (WiFi.SSID(i) != String(ssid))
      continue;
    int ch = (int)WiFi.channel(i);
    int rssi = WiFi.RSSI(i);
    /* C3 仅 2.4G；若扫描到非 1–14 信道（少见/异常）则跳过，避免 pin 错频段 */
    if (ch < 1 || ch > 14)
      continue;
    if (!haveBssid || rssi > bestRssi) {
      bestRssi = rssi;
      useCh = ch;
      memcpy(bssid, WiFi.BSSID(i), 6);
      haveBssid = true;
    }
  }
  if (haveBssid)
    Serial.printf("[WiFi] best match rssi=%d ch=%d\n", bestRssi, (int)useCh);
  else
    logProv(provSeq, "SCAN", "target ssid not found in prescan");
  WiFi.scanDelete();
  delay(200);

  auto waitConnect = [&](const char *phase, unsigned long timeoutMs) {
    int lastSt = -999;
    unsigned long lastPrint = 0;
    unsigned long t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) {
      int st = (int)WiFi.status();
      if (st != lastSt || millis() - lastPrint >= 1500) {
        char msg[96];
        snprintf(msg, sizeof(msg), "%s waiting status=%s elapsed=%lums", phase, wifiStatusName(st),
                 (unsigned long)(millis() - t0));
        logProv(provSeq, "WAIT", msg);
        lastSt = st;
        lastPrint = millis();
      }
      delay(200);
      esp_task_wdt_reset();
    }
    char done[96];
    snprintf(done, sizeof(done), "%s done status=%s elapsed=%lums", phase,
             wifiStatusName((int)WiFi.status()), (unsigned long)(millis() - t0));
    logProv(provSeq, "WAIT", done);
  };

  /* 主路径：不 pin BSSID（与 BLE 共存、家用路由兼容性最好） */
  Serial.println("[WiFi] begin (ssid+psk only, no BSSID pin)");
  logProv(provSeq, "WIFI", "WiFi.begin(ssid,pass)");
  WiFi.begin(ssid, pass);
  waitConnect("begin#1", 45000);

  if (WiFi.status() != WL_CONNECTED && haveBssid && useCh > 0) {
    Serial.println("[WiFi] retry: begin with channel+BSSID from scan");
    logProv(provSeq, "WIFI", "retry#2 begin(ssid,pass,ch,bssid)");
    WiFi.disconnect(false);
    delay(400);
    WiFi.begin(ssid, pass, useCh, bssid);
    waitConnect("begin#2", 45000);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] retry: begin without channel/BSSID (fresh)");
    logProv(provSeq, "WIFI", "retry#3 begin(ssid,pass)");
    WiFi.disconnect(false);
    delay(400);
    WiFi.begin(ssid, pass);
    waitConnect("begin#3", 45000);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] retry: full WiFi stack reset then begin");
    logProv(provSeq, "WIFI", "retry#4 WIFI_OFF -> WIFI_STA -> begin");
    WiFi.disconnect(true, true);
    delay(300);
    WiFi.mode(WIFI_OFF);
    delay(250);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(true);
    WiFi.setAutoReconnect(true);
    delay(250);
    WiFi.begin(ssid, pass);
    waitConnect("begin#4", 30000);
  }

  JsonDocument res;
  if (WiFi.status() == WL_CONNECTED) {
    delay(120);

    res["type"] = "wifi.result";
    res["ok"] = true;
    res["ip"] = WiFi.localIP().toString();
    res["device_id"] = gDeviceId;
    uint8_t m[6];
    esp_read_mac(m, ESP_MAC_WIFI_STA);
    char mac[18];
    snprintf(mac, sizeof(mac), "%02X:%02X:%02X:%02X:%02X:%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
    res["mac"] = mac;
    res["fw_version"] = FW_VERSION;
    nvsSetStr("wifi_ssid", String(ssid));
    nvsSetStr("wifi_pass", String(pass));
    syncTime();
    setenv("TZ", "CST-8", 1);
    tzset();
  } else {
    int st = (int)WiFi.status();
    res["type"] = "wifi.result";
    res["ok"] = false;
    res["error"] = "wifi_connect_failed";
    res["wifi_status"] = st;
    res["hint"] =
        "WiFi connect failed: check 2.4G SSID/password and router security mode";
    Serial.printf("[WiFi] connect failed %s\n", wifiStatusName(st));
    char fail[80];
    snprintf(fail, sizeof(fail), "connect failed final=%s", wifiStatusName(st));
    logProv(provSeq, "RESULT", fail);
  }
  Serial.printf("[BLE TX] wifi.result ok=%d (含 device_id，单包完成配网)\n",
                WiFi.status() == WL_CONNECTED ? 1 : 0);
  /* STA 刚连上或失败后，给 BLE 主机栈一点时间再发 notify，避免手机一直等 */
  delay(400);
  logProv(provSeq, "BLE", "about to notify wifi.result");
  bleNotifyJson(res);
  Serial.println("[BLE] wifi.result notify done");
  logProv(provSeq, "BLE", "wifi.result notify done");

  if (WiFi.status() == WL_CONNECTED) {
    delay(120);
    NimBLEDevice::deinit(false);
    gBleServer = nullptr;
    gBleTx = nullptr;
    gBleActive = false;
    Serial.println("[BLE] deinit after provision OK (not discoverable)");
    logProv(provSeq, "END", "success deinit BLE");
  } else {
    NimBLEDevice::startAdvertising();
    logProv(provSeq, "END", "failed restart advertising");
  }
  gProvWifiRunning = false;
}

static void handleWifiSet(const char *ssid, const char *pass) {
  if (!ssid || !ssid[0])
    return;
  if (gProvWifiRunning) {
    Serial.println("[WiFi] reject new wifi.set: provisioning is running");
    JsonDocument res;
    res["type"] = "wifi.result";
    res["ok"] = false;
    res["error"] = "wifi_provision_busy";
    res["hint"] = "设备正在配网中，请稍后再试";
    res["wifi_status"] = (int)WiFi.status();
    bleNotifyJson(res);
    return;
  }
  if (gProvWifiPending) {
    Serial.println("[WiFi] replace previous pending wifi.set");
  }
  serialPrintWifiParams("handleWifiSet(已入队)", ssid, pass);
  gProvWifiSsid = ssid;
  gProvWifiPass = pass ? pass : "";
  gProvWifiPending = true;
  Serial.printf("[WiFi] queued (BLE returns immediately)\n");
}

static void handleBleJson(JsonObject root) {
  const char *type = root["type"] | "";
  Serial.printf("[BLE] json type=%s\n", type && type[0] ? type : "(empty)");
  /* 兼容仅含 ssid/password 的裸 JSON（等同 wifi.set） */
  if ((!type || !type[0]) && root["ssid"].is<const char *>()) {
    handleWifiSet(root["ssid"] | "", root["password"] | "");
    return;
  }
  if (!strcmp(type, "wifi.set")) {
    const char *ssid = root["ssid"] | "";
    const char *pass = root["password"] | "";
    if (ssid[0])
      handleWifiSet(ssid, pass);
    return;
  }
  if (!strcmp(type, "bind.prepare")) {
    const char *tok = root["token"] | "";
    if (tok[0])
      nvsSetStr("bind_token", String(tok));
    return;
  }
}

static void tryParsePlainBleAccum() {
  JsonDocument doc;
  DeserializationError e = deserializeJson(doc, gRxPlainAccum);
  if (e) {
    Serial.printf("[BLE] plain incomplete len=%u\n", (unsigned)gRxPlainAccum.length());
    if (gRxPlainAccum.length() > 1200)
      gRxPlainAccum = "";
    return;
  }
  gRxPlainAccum = "";
  Serial.println("[BLE] plain JSON parsed ok");
  handleBleJson(doc.as<JsonObject>());
}

static void onBleWrite(const std::string &raw) {
  const uint8_t *d = (const uint8_t *)raw.data();
  size_t len = raw.size();
  if (!len)
    return;

  Serial.printf("[BLE RX] len=%u first=0x%02x\n", (unsigned)len, d[0]);

  /* 裸 JSON：首字节为 `{`；若 ATT MTU 较小会拆成多包，后续包不以 `{` 开头，需拼接 */
  if (d[0] == '{') {
    gRxPlainAccum = raw.c_str();
    Serial.printf("[BLE] plain start accum=%u\n", (unsigned)gRxPlainAccum.length());
    tryParsePlainBleAccum();
    return;
  }
  if (gRxPlainAccum.length() > 0) {
    gRxPlainAccum += raw.c_str();
    Serial.printf("[BLE] plain cont accum=%u\n", (unsigned)gRxPlainAccum.length());
    tryParsePlainBleAccum();
    return;
  }

  /* 分帧写入（与 §7 通知侧相同：[seq][last][payload…]） */
  if (len < 3) {
    Serial.printf("[BLE] framed too short\n");
    return;
  }
  bool last = (d[1] & 1) != 0;
  for (size_t i = 2; i < len; i++)
    gRxBleBuf += (char)d[i];
  if (last) {
    Serial.printf("[BLE] framed last gRxBleBuf_len=%u\n", (unsigned)gRxBleBuf.length());
    JsonDocument doc;
    DeserializationError e = deserializeJson(doc, gRxBleBuf);
    gRxBleBuf = "";
    if (!e) {
      Serial.println("[BLE] framed JSON parsed ok");
      handleBleJson(doc.as<JsonObject>());
    } else {
      Serial.printf("[BLE] framed JSON parse fail\n");
    }
  }
}

class SRVCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *pServer) override {
    (void)pServer;
    Serial.println("[BLE] central disconnected, restart advertising");
    NimBLEDevice::startAdvertising();
  }
};

class RxCb : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override { onBleWrite(c->getValue()); }
};

static void bleSetup() {
  NimBLEDevice::init(gBleName.c_str());
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  gBleServer = NimBLEDevice::createServer();
  gBleServer->setCallbacks(new SRVCallbacks());

  NimBLEService *svc = gBleServer->createService(kBleSvc);
  NimBLECharacteristic *rx =
      svc->createCharacteristic(kBleRx, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCb());
  gBleTx = svc->createCharacteristic(kBleTx, NIMBLE_PROPERTY::NOTIFY);
  svc->start();

  NimBLEAdvertising *ad = NimBLEDevice::getAdvertising();
  ad->setName(gBleName.c_str());
  ad->addServiceUUID(kBleSvc);
  ad->setScanResponse(true);
  NimBLEDevice::startAdvertising();
  gBleActive = true;
}

// ---------- MQTT 上报 / 应答 ----------
static void publishReport(bool fromSchedule = false, int64_t scheduleId = 0, const char *scheduleAction = nullptr) {
  if (!gMqtt.connected())
    return;
  JsonDocument doc;
  doc["ts"] = nowMs();
  doc["online"] = true;
  doc["relay_on"] = gRelayOn;
  doc["rssi"] = WiFi.RSSI();
  doc["fw_version"] = FW_VERSION;
  doc["schedule_revision"] = gScheduleRevision;
  if (fromSchedule) {
    doc["report_reason"] = "schedule";
    if (scheduleId != 0)
      doc["schedule_id"] = scheduleId;
    if (scheduleAction && scheduleAction[0])
      doc["schedule_action"] = scheduleAction;
  }
  String out;
  serializeJson(doc, out);
  gMqtt.publish(tReport().c_str(), out.c_str(), out.length(), false, 1);
}

static void publishLwtOnline() {
  if (!gMqtt.connected())
    return;
  JsonDocument doc;
  doc["online"] = true;
  doc["ts"] = nowMs();
  String out;
  serializeJson(doc, out);
  gMqtt.publish(tLwt().c_str(), out.c_str(), out.length(), true, 1);
}

static void publishAckOk(const char *cmdId, JsonObject applied) {
  if (!gMqtt.connected() || !cmdId || !cmdId[0])
    return;
  JsonDocument doc;
  doc["cmd_id"] = cmdId;
  doc["ts"] = nowMs();
  doc["success"] = true;
  doc["error_code"] = nullptr;
  doc["error_message"] = nullptr;
  doc["applied"] = applied;
  String out;
  serializeJson(doc, out);
  gMqtt.publish(tAck().c_str(), out.c_str(), out.length(), false, 1);
}

static void publishAckErr(const char *cmdId, int errCode, const char *errMsg) {
  if (!gMqtt.connected() || !cmdId || !cmdId[0])
    return;
  JsonDocument doc;
  doc["cmd_id"] = cmdId;
  doc["ts"] = nowMs();
  doc["success"] = false;
  doc["error_code"] = errCode;
  doc["error_message"] = errMsg;
  String out;
  serializeJson(doc, out);
  gMqtt.publish(tAck().c_str(), out.c_str(), out.length(), false, 1);
}

static void publishOtaProgress(int percent, const char *phase) {
  if (!gMqtt.connected())
    return;
  JsonDocument doc;
  doc["ts"] = nowMs();
  doc["percent"] = percent;
  doc["phase"] = phase;
  String out;
  serializeJson(doc, out);
  gMqtt.publish(tOtaProg().c_str(), out.c_str(), out.length(), false, 1);
}

// ---------- OTA HTTPS §8 ----------
static void doOta(const char *url, const char *md5expect, size_t sizeHint) {
  gOtaBusy = true;
  publishOtaProgress(0, "download");
  WiFiClientSecure cli;
  cli.setInsecure();
  cli.setTimeout(30000);

  HTTPClient http;
  if (!http.begin(cli, url)) {
    gOtaBusy = false;
    return;
  }
  int code = http.GET();
  if (code != 200) {
    http.end();
    gOtaBusy = false;
    return;
  }
  int len = http.getSize();
  if (len <= 0 && sizeHint > 0)
    len = (int)sizeHint;
  if (len <= 0) {
    http.end();
    gOtaBusy = false;
    return;
  }

  WiFiClient *s = http.getStreamPtr();
  if (!Update.begin((size_t)len)) {
    http.end();
    gOtaBusy = false;
    return;
  }

  mbedtls_md5_context ctx;
  mbedtls_md5_init(&ctx);
  mbedtls_md5_starts_ret(&ctx);
  uint8_t buf[1024];
  size_t done = 0;
  size_t total = (size_t)len;
  while (http.connected() && done < total) {
    size_t avail = s->available();
    if (!avail) {
      delay(1);
      continue;
    }
    size_t rd = s->readBytes(buf, min(sizeof(buf), min((size_t)avail, total - done)));
    if (!rd)
      break;
    mbedtls_md5_update_ret(&ctx, buf, rd);
    if (Update.write(buf, rd) != (int)rd) {
      Update.abort();
      http.end();
      gOtaBusy = false;
      return;
    }
    done += rd;
    if (total)
      publishOtaProgress((int)(done * 100 / total), "download");
    esp_task_wdt_reset();
  }
  uint8_t md5bin[16];
  mbedtls_md5_finish_ret(&ctx, md5bin);
  mbedtls_md5_free(&ctx);
  char hex[33];
  for (int i = 0; i < 16; i++)
    sprintf(hex + i * 2, "%02x", md5bin[i]);
  hex[32] = 0;
  if (strlen(md5expect) == 32 && strcasecmp(hex, md5expect) != 0) {
    Update.abort();
    http.end();
    gOtaBusy = false;
    return;
  }
  if (!Update.end(true)) {
    http.end();
    gOtaBusy = false;
    return;
  }
  http.end();
  publishOtaProgress(100, "done");
  delay(200);
  ESP.restart();
}

// ---------- schedule.sync 存储与简单执行 ----------
static void loadScheduleNvs() {
  String j;
  if (nvsGetStr("sched_json", j))
    gSchedulesJson = j;
  nvs_handle_t h;
  int64_t rev = 0;
  if (nvs_open(kNvs, NVS_READONLY, &h) == ESP_OK) {
    nvs_get_i64(h, "sch_rev", &rev);
    nvs_close(h);
  }
  gScheduleRevision = rev;
}

static void saveScheduleNvs(JsonArray arr, int64_t revision) {
  String j;
  serializeJson(arr, j);
  gSchedulesJson = j;
  gScheduleRevision = revision;
  nvsSetStr("sched_json", j);
  nvs_handle_t h;
  if (nvs_open(kNvs, NVS_READWRITE, &h) == ESP_OK) {
    nvs_set_i64(h, "sch_rev", revision);
    nvs_commit(h);
    nvs_close(h);
  }
}

static void runSchedulesTick() {
  struct tm ti;
  if (!getLocalTime(&ti))
    return;
  JsonDocument doc;
  if (deserializeJson(doc, gSchedulesJson))
    return;
  JsonArray arr = doc.as<JsonArray>();
  char curTime[6];
  snprintf(curTime, sizeof(curTime), "%02d:%02d", ti.tm_hour, ti.tm_min);
  int wday = ti.tm_wday;

  for (JsonVariant v : arr) {
    JsonObject s = v.as<JsonObject>();
    if (!(bool)(s["enabled"] | false))
      continue;
    const char *rt = s["repeat_type"] | "once";
    const char *tl = s["time_local"] | "";
    if (strncmp(tl, curTime, 5) != 0)
      continue;
    if (!strcmp(rt, "daily") || !strcmp(rt, "once")) {
      /* 仅 time 匹配（once 执行后下方禁用该条） */
    } else if (!strcmp(rt, "weekly")) {
      bool hit = false;
      JsonArray wd = s["weekdays"].as<JsonArray>();
      for (JsonVariant d : wd) {
        if ((int)d == wday) {
          hit = true;
          break;
        }
      }
      if (!hit)
        continue;
    } else if (!strcmp(rt, "monthly")) {
      bool hit = false;
      int md = ti.tm_mday;
      JsonArray mdays = s["monthdays"].as<JsonArray>();
      for (JsonVariant d : mdays) {
        if ((int)d == md) {
          hit = true;
          break;
        }
      }
      if (!hit)
        continue;
    } else {
      continue;
    }
    const char *act = s["action"] | "off";
    applyRelay(!strcmp(act, "on"));
    publishReport();
    if (!strcmp(rt, "once")) {
      s["enabled"] = false;
      String j;
      serializeJson(doc, j);
      gSchedulesJson = j;
      nvsSetStr("sched_json", j);
    }
    break;
  }
}

static unsigned long gLastSchedCheck = 0;

// ---------- MQTT 下行 cmd §4 ----------
static void handleMqttMessage(String &topic, String &payload) {
  JsonDocument doc;
  if (deserializeJson(doc, payload))
    return;
  JsonObject root = doc.as<JsonObject>();
  const char *cmdId = root["cmd_id"] | "";
  const char *tp = root["type"] | "";
  JsonObject pay = root["payload"].as<JsonObject>();

  if (topic.endsWith("/ota")) {
    tp = root["type"] | "ota.start";
    pay = root["payload"].as<JsonObject>();
  }

  if (!strcmp(tp, "ping")) {
    JsonDocument ap;
    publishAckOk(cmdId, ap.as<JsonObject>());
    return;
  }

  if (!strcmp(tp, "relay.set")) {
    bool on = (bool)(pay["on"] | false);
    applyRelay(on);
    JsonDocument ap;
    ap["relay_on"] = gRelayOn;
    publishAckOk(cmdId, ap.as<JsonObject>());
    publishReport();
    return;
  }

  if (!strcmp(tp, "relay.toggle")) {
    applyRelay(!gRelayOn);
    JsonDocument ap;
    ap["relay_on"] = gRelayOn;
    publishAckOk(cmdId, ap.as<JsonObject>());
    publishReport();
    return;
  }

  if (!strcmp(tp, "ota.start")) {
    const char *url = pay["url"] | "";
    const char *md5e = pay["md5"] | "";
    size_t sz = (size_t)(pay["size"] | 0);
    if (!url[0]) {
      publishAckErr(cmdId, 40001, "bad_payload");
      return;
    }
    JsonDocument ap;
    publishAckOk(cmdId, ap.as<JsonObject>());
    doOta(url, md5e, sz);
    return;
  }

  if (!strcmp(tp, "schedule.sync")) {
    int64_t rev = (int64_t)(pay["revision"] | 0);
    JsonDocument schDoc;
    JsonArray sch;
    if (pay["schedules"].is<JsonArray>())
      sch = pay["schedules"].as<JsonArray>();
    else
      sch = schDoc.to<JsonArray>();
    saveScheduleNvs(sch, rev);
    JsonDocument ap;
    ap["schedule_revision"] = gScheduleRevision;
    publishAckOk(cmdId, ap.as<JsonObject>());
    publishReport();
    return;
  }

  publishAckErr(cmdId, 60002, "unknown_type");
}

static void mqttOnMsg(String &topic, String &payload) { handleMqttMessage(topic, payload); }

static bool mqttConnect() {
  if (WiFi.status() != WL_CONNECTED)
    return false;
  if (gMqtt.connected())
    return true;
  gMqtt.setWill(tLwt().c_str(), "{\"online\":false}", true, 1);
  gMqtt.setKeepAlive(30);
  gWifiTcp.stop();
  gMqtt.begin(MQTT_HOST, MQTT_PORT, gWifiTcp);
  delay(20);
  bool ok = gMqtt.connect(mqttClientId().c_str(), MQTT_USER, MQTT_PASS);
  if (!ok) {
    gMqttFailStreak++;
    Serial.printf("[MQTT] connect failed streak=%d\n", gMqttFailStreak);
    return false;
  }
  gMqttFailStreak = 0;
  gLastMqttReconnectTry = millis();
  Serial.println("[MQTT] connected");
  gMqtt.subscribe(tCmd().c_str(), 1);
  gMqtt.subscribe(tOta().c_str(), 1);
  publishLwtOnline();
  publishReport();
  setLedMode(LED_BREATH);
  return true;
}

static void mqttLoopReconnect() {
  if (gMqtt.connected() || WiFi.status() != WL_CONNECTED || gOtaBusy)
    return;
  if (gMqttOfflineSince > 0 && millis() - gMqttOfflineSince < 1500)
    return;
  unsigned long backoff = 3000 + (unsigned long)min(gMqttFailStreak, 6) * 2000UL;
  if (millis() - gLastMqttReconnectTry < backoff)
    return;
  gLastMqttReconnectTry = millis();
  Serial.printf("[MQTT] reconnect tick backoff=%lums streak=%d\n", backoff, gMqttFailStreak);
  mqttConnect();
}

static void wifiHealTick() {
  if (gProvWifiRunning || gProvWifiPending)
    return;
  int st = (int)WiFi.status();
  if (st != gLastWifiStatus || millis() - gLastWifiStateLog >= 10000) {
    Serial.printf("[WIFI] state=%s rssi=%d\n", wifiStatusName(st), WiFi.RSSI());
    gLastWifiStatus = st;
    gLastWifiStateLog = millis();
  }
  if (st == WL_CONNECTED) {
    gWifiHealAttempt = 0;
    if (!gBleActive) {
      WiFi.setSleep(false);
    }
    return;
  }

  /* 若处于 IDLE（连接过程）且未超过 35s，避免重复动作打断关联 */
  if (st == WL_IDLE_STATUS && millis() - gLastWifiHealTry < 35000)
    return;

  if (millis() - gLastWifiHealTry < 12000)
    return;
  gLastWifiHealTry = millis();
  gWifiHealAttempt++;

  if (gMqtt.connected()) {
    Serial.println("[WIFI] down -> disconnect mqtt");
    gMqtt.disconnect();
  }

  String ssid, pass;
  if (!(nvsGetStr("wifi_ssid", ssid) && nvsGetStr("wifi_pass", pass) && ssid.length())) {
    Serial.println("[WIFI] no saved credentials");
    return;
  }

  int phase = gWifiHealAttempt % 3;
  if (phase == 1) {
    Serial.printf("[WIFI] heal#%d reconnect()\n", gWifiHealAttempt);
    WiFi.reconnect();
    return;
  }
  if (phase == 2) {
    Serial.printf("[WIFI] heal#%d disconnect(false)+reconnect()\n", gWifiHealAttempt);
    WiFi.disconnect(false);
    delay(120);
    WiFi.reconnect();
    return;
  }
  Serial.printf("[WIFI] heal#%d begin ssid=%s\n", gWifiHealAttempt, ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid.c_str(), pass.c_str());
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("\n[SmartRelay] boot " FW_VERSION "\n");

  esp_task_wdt_init(30, true);
  esp_task_wdt_add(NULL);

  pinMode(PIN_BOOT, INPUT_PULLUP);
  pinMode(PIN_RELAY, OUTPUT);
  applyRelay(false);
  ledInit();
  setLedMode(LED_PROVISION);

  nvs_flash_init();
  loadScheduleNvs();

  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char idbuf[20];
  snprintf(idbuf, sizeof(idbuf), "SR-%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3],
           mac[4], mac[5]);
  gDeviceId = idbuf;
  char bn[16];
  snprintf(bn, sizeof(bn), "SR-%02X%02X", mac[4], mac[5]);
  gBleName = bn;

  bool bootWifiConnected = false;
  String ssid, pass;
  if (nvsGetStr("wifi_ssid", ssid) && nvsGetStr("wifi_pass", pass) && ssid.length()) {
    Serial.printf("[BOOT] found saved wifi ssid=%s len(pass)=%u\n", ssid.c_str(), (unsigned)pass.length());
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(true);
    WiFi.setAutoReconnect(true);
    WiFi.begin(ssid.c_str(), pass.c_str());
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 30000) {
      delay(200);
      esp_task_wdt_reset();
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[BOOT] wifi connected ip=%s rssi=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      bootWifiConnected = true;
      syncTime();
      setenv("TZ", "CST-8", 1);
      tzset();
    } else {
      Serial.printf("[BOOT] wifi not connected in boot window, status=%s; will heal in loop\n",
                    wifiStatusName((int)WiFi.status()));
    }
  } else {
    Serial.println("[BOOT] no saved wifi credentials in nvs");
  }
  if (!bootWifiConnected) {
    bleSetup();
  } else {
    WiFi.setSleep(false);
    Serial.println("[BOOT] skip BLE advertising because WiFi already connected");
  }

  gMqtt.begin(MQTT_HOST, MQTT_PORT, gWifiTcp);
  gMqtt.onMessage(mqttOnMsg);
  if (WiFi.status() == WL_CONNECTED)
    mqttConnect();

  gLastHeartbeat = millis();
}

void loop() {
  esp_task_wdt_reset();

  if (gProvWifiPending) {
    Serial.printf("[WiFi] dequeue provisioning pending=1 running=%d\n", gProvWifiRunning ? 1 : 0);
    gProvWifiPending = false;
    String s = gProvWifiSsid;
    String p = gProvWifiPass;
    runWifiProvisioning(s.c_str(), p.c_str());
  }

  if (digitalRead(PIN_BOOT) == LOW) {
    if (gBootPressStart == 0)
      gBootPressStart = millis();
    else if (millis() - gBootPressStart >= (unsigned long)BOOT_CLEAR_MS) {
      clearWifiCredentials();
      delay(200);
      ESP.restart();
    }
  } else {
    gBootPressStart = 0;
  }

  wifiHealTick();
  bool wifiNowConnected = (WiFi.status() == WL_CONNECTED);
  if (wifiNowConnected && !gPrevWifiConnected) {
    Serial.println("[WIFI] transition -> connected");
    gLastMqttReconnectTry = 0;
    gMqttOfflineSince = millis();
    mqttConnect();
  }
  gPrevWifiConnected = wifiNowConnected;

  if (WiFi.status() == WL_CONNECTED) {
    bool mqttNow = gMqtt.connected();
    if (mqttNow) {
      gMqttOfflineSince = 0;
      if (!gMqtt.loop()) {
        if (gMqttOfflineSince == 0)
          gMqttOfflineSince = millis();
        if (millis() - gLastMqttLoopFailLog > 5000) {
          gLastMqttLoopFailLog = millis();
          Serial.println("[MQTT] loop indicates disconnected");
        }
      }
    } else if (gMqttOfflineSince == 0) {
      gMqttOfflineSince = millis();
    }

    mqttNow = gMqtt.connected();
    if (mqttNow != gPrevMqttConnected) {
      Serial.printf("[MQTT] state -> %s\n", mqttNow ? "connected" : "disconnected");
      gPrevMqttConnected = mqttNow;
    }

    if (gMqtt.connected()) {
      gMqttFailStreak = 0;
    } else {
      if (millis() - gLastMqttLoopFailLog > 5000) {
        gLastMqttLoopFailLog = millis();
        Serial.println("[MQTT] waiting reconnect...");
      }
      mqttLoopReconnect();
    }

    if (!gOtaBusy && gMqtt.connected() && millis() - gLastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      gLastHeartbeat = millis();
      publishReport();
    }

    /* 每分钟整点匹配改为约 10s 轮询一次，减少「定 15:26 却要等近一分钟」的体感延迟 */
    if (gMqtt.connected() && millis() - gLastSchedCheck >= 10000) {
      gLastSchedCheck = millis();
      runSchedulesTick();
    }
  }

  ledLoop();
  delay(2);
}
