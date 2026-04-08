/**
 * SmartRelay ESP32-C3 固件
 * 协议契约：仓库根目录《协议标准.md》v1.0
 */

#include <Arduino.h>
#include <esp_log.h>
#include <math.h>
#include <WiFi.h>
#include <Preferences.h>
#include <esp_mac.h>
#include <esp_task_wdt.h>
#include <sys/time.h>
#include <time.h>

#include <ArduinoJson.h>
#include <MQTT.h>
#include <WiFiClient.h>

#include <NimBLEDevice.h>

#include "config.h"

static const char *TAG_SR = "SmartRelay";

// —— 全局 ——
static char g_deviceSn[13];
static char g_clientId[20];
static String g_topicCmd;
static String g_topicAck;
static String g_topicTel;
static String g_topicEvt;

static WiFiClient g_wifiClient;
static MQTTClient g_mqtt(4096);

static Preferences g_prefs;
static const char *kNs = "sr";

// cmd_id 幂等：记录最近执行结果
static constexpr int kCmdHist = 32;
struct CmdEntry {
  char id[37];
  bool relay_on;
  bool used;
};
static CmdEntry g_cmdHist[kCmdHist];

static NimBLECharacteristic *g_pTxChar = nullptr;
static bool g_bleRunning = false;

enum class LedMode : uint8_t { FastBlink, Breath };
static LedMode g_ledMode = LedMode::FastBlink;
static uint32_t g_lastLedToggle = 0;
static uint32_t g_breathPhase = 0;

static bool g_relayOn = false;

static uint32_t g_bootDownMs = 0;
static bool g_bootWasDown = false;

static uint32_t g_lastTelem = 0;
static uint32_t g_hbSeq = 0;

// —— 工具 ——
static void formatIsoUtc(char *buf, size_t len) {
  struct timeval tv {};
  gettimeofday(&tv, nullptr);
  struct tm t {};
  gmtime_r(&tv.tv_sec, &t);
  char base[32];
  strftime(base, sizeof(base), "%Y-%m-%dT%H:%M:%S", &t);
  long ms = tv.tv_usec / 1000;
  snprintf(buf, len, "%s.%03ldZ", base, ms);
}

static void loadDeviceSn() {
  uint8_t mac[6]{};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(g_deviceSn, sizeof(g_deviceSn), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2],
             mac[3], mac[4], mac[5]);
  snprintf(g_clientId, sizeof(g_clientId), "SR_%s", g_deviceSn);
  g_topicCmd = String("smartrelay/v1/") + g_deviceSn + "/down/cmd";
  g_topicAck = String("smartrelay/v1/") + g_deviceSn + "/up/ack";
  g_topicTel = String("smartrelay/v1/") + g_deviceSn + "/up/telemetry";
  g_topicEvt = String("smartrelay/v1/") + g_deviceSn + "/up/event";
}

static void relayApply(bool on) {
  g_relayOn = on;
  digitalWrite(PIN_RELAY, on ? LOW : HIGH);
}

static void ledSetMode(LedMode m) {
  g_ledMode = m;
  if (m == LedMode::FastBlink) {
    ledcDetachPin(PIN_LED);
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);
  } else {
    pinMode(PIN_LED, OUTPUT);
    ledcSetup(0, 5000, 8);
    ledcAttachPin(PIN_LED, 0);
  }
}

static void ledTick() {
  const uint32_t now = millis();
  if (g_ledMode == LedMode::FastBlink) {
    if (now - g_lastLedToggle >= 120) {
      g_lastLedToggle = now;
      digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    }
  } else {
    g_breathPhase += 25;
    const float x = (g_breathPhase % 6283) / 1000.0f;
    const float s = sinf(x);
    const uint32_t duty = (uint32_t)((s + 1.0f) * 0.5f * 220.0f) + 10;
    ledcWrite(0, duty > 255 ? 255 : duty);
  }
}

static bool prefsHasWifi() {
  String ssid = g_prefs.getString("wifi_ssid", "");
  return ssid.length() > 0;
}

static void prefsClearWifi() {
  g_prefs.remove("wifi_ssid");
  g_prefs.remove("wifi_pass");
}

static bool findCmdHistory(const char *cmdId, bool *relayOut) {
  for (auto &e : g_cmdHist) {
    if (e.used && strcmp(e.id, cmdId) == 0) {
      *relayOut = e.relay_on;
      return true;
    }
  }
  return false;
}

static void pushCmdHistory(const char *cmdId, bool relay_on) {
  static int idx = 0;
  strncpy(g_cmdHist[idx].id, cmdId, sizeof(g_cmdHist[idx].id) - 1);
  g_cmdHist[idx].id[sizeof(g_cmdHist[idx].id) - 1] = 0;
  g_cmdHist[idx].relay_on = relay_on;
  g_cmdHist[idx].used = true;
  idx = (idx + 1) % kCmdHist;
}

static void publishAck(const char *cmdId, bool success, bool relay_on, const char *errCode) {
  JsonDocument doc;
  doc["ver"] = "1";
  doc["cmd_id"] = cmdId;
  doc["device_sn"] = g_deviceSn;
  doc["success"] = success;
  doc["relay_on"] = relay_on;
  if (success) {
    doc["error_code"].set(nullptr);
    doc["error_message"].set(nullptr);
  } else {
    doc["error_code"] = errCode ? errCode : "UNKNOWN";
    doc["error_message"] = errCode ? errCode : "UNKNOWN";
  }
  char ts[40];
  formatIsoUtc(ts, sizeof(ts));
  doc["ts"] = ts;
  String out;
  serializeJson(doc, out);
  g_mqtt.publish(g_topicAck.c_str(), out.c_str(), out.length(), false, 1);
}

static void publishTelemetry() {
  JsonDocument doc;
  doc["ver"] = "1";
  doc["device_sn"] = g_deviceSn;
  doc["relay_on"] = g_relayOn;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_sec"] = (uint32_t)(millis() / 1000);
  doc["hb_seq"] = ++g_hbSeq;
  char ts[40];
  formatIsoUtc(ts, sizeof(ts));
  doc["ts"] = ts;
  String out;
  serializeJson(doc, out);
  const int qos = 1;
  g_mqtt.publish(g_topicTel.c_str(), out.c_str(), out.length(), false, qos);
}

static void onMqttMessage(String &topic, String &payload) {
  (void)topic;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    ESP_LOGI(TAG_SR, "[MQTT] JSON parse err: %s", err.c_str());
    return;
  }
  const char *ver = doc["ver"];
  const char *cmdId = doc["cmd_id"];
  const char *type = doc["type"];
  if (!ver || strcmp(ver, "1") != 0) {
    ESP_LOGI(TAG_SR, "[MQTT] ver != 1");
    return;
  }
  if (!cmdId || strlen(cmdId) == 0) {
    return;
  }
  if (!type || strcmp(type, "relay_set") != 0) {
    publishAck(cmdId, false, g_relayOn, "UNKNOWN");
    return;
  }
  JsonObject p = doc["payload"].as<JsonObject>();
  if (p.isNull() || !p["on"].is<bool>()) {
    publishAck(cmdId, false, g_relayOn, "UNKNOWN");
    return;
  }
  const bool wantOn = p["on"].as<bool>();

  bool prevRelay = g_relayOn;
  if (findCmdHistory(cmdId, &prevRelay)) {
    publishAck(cmdId, true, prevRelay, nullptr);
    return;
  }
  relayApply(wantOn);
  pushCmdHistory(cmdId, g_relayOn);
  publishAck(cmdId, true, g_relayOn, nullptr);
}

static bool mqttConnect() {
  String user = g_prefs.getString("mqtt_user", "");
  String pass = g_prefs.getString("mqtt_pass", "");
  const char *u = (user.length() > 0) ? user.c_str() : CFG_MQTT_USER;
  const char *p = (pass.length() > 0) ? pass.c_str() : CFG_MQTT_PASS;
  g_mqtt.setWill(g_topicEvt.c_str(), "{\"type\":\"offline\"}", false, 0);
  if (!g_mqtt.connect(g_clientId, u, p)) {
    return false;
  }
  g_mqtt.subscribe(g_topicCmd.c_str(), 1);
  return true;
}

static void mqttEnsure() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (!g_mqtt.connected()) {
    if (mqttConnect()) {
      ESP_LOGI(TAG_SR, "[MQTT] connected");
    }
  }
}

static void stopBle() {
  if (!g_bleRunning) {
    return;
  }
  NimBLEDevice::getAdvertising()->stop();
  NimBLEDevice::deinit(true);
  g_bleRunning = false;
  g_pTxChar = nullptr;
  ESP_LOGI(TAG_SR, "[BLE] stopped");
}

static void notifyWifiResult(bool ok, const char *ip) {
  if (!g_pTxChar) {
    return;
  }
  JsonDocument doc;
  doc["type"] = "wifi_result";
  doc["ok"] = ok;
  if (ok && ip) {
    doc["ip"] = ip;
  }
  String out;
  serializeJson(doc, out);
  g_pTxChar->setValue((uint8_t *)out.c_str(), out.length());
  g_pTxChar->notify();
}

class SrRxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    const std::string v = c->getValue();
    if (v.empty()) {
      return;
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, v.data(), v.size());
    if (err) {
      ESP_LOGI(TAG_SR, "[BLE] JSON err: %s", err.c_str());
      return;
    }
    const char *t = doc["type"];
    if (!t || strcmp(t, "wifi_config") != 0) {
      return;
    }
    const char *ssid = doc["ssid"];
    const char *password = doc["password"];
    if (!ssid || !password) {
      notifyWifiResult(false, nullptr);
      return;
    }
    g_prefs.putString("wifi_ssid", ssid);
    g_prefs.putString("wifi_pass", password);
    ESP_LOGI(TAG_SR, "[BLE] wifi_config ssid=%s", ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_ATTEMPT_MS) {
      delay(200);
      esp_task_wdt_reset();
    }
    if (WiFi.status() == WL_CONNECTED) {
      notifyWifiResult(true, WiFi.localIP().toString().c_str());
      stopBle();
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      g_mqtt.begin(CFG_MQTT_HOST, CFG_MQTT_PORT, g_wifiClient);
      g_mqtt.onMessage(onMqttMessage);
      for (int i = 0; i < 40; i++) {
        time_t now = time(nullptr);
        if (now > 1700000000) {
          break;
        }
        delay(250);
        esp_task_wdt_reset();
      }
      uint32_t mq = millis();
      while (!mqttConnect() && millis() - mq < 20000) {
        delay(300);
        esp_task_wdt_reset();
      }
      if (g_mqtt.connected()) {
        ledSetMode(LedMode::Breath);
      }
    } else {
      notifyWifiResult(false, nullptr);
      prefsClearWifi();
    }
  }
};

static void startBleProvisioning() {
  if (g_bleRunning) {
    return;
  }
  char suffix[5]{};
  memcpy(suffix, g_deviceSn + 8, 4);
  suffix[4] = 0;
  char advName[24];
  snprintf(advName, sizeof(advName), "SR-%s", suffix);

  NimBLEDevice::init(advName);
  NimBLEServer *srv = NimBLEDevice::createServer();
  static const NimBLEUUID svc("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  static const NimBLEUUID rxUuid("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
  static const NimBLEUUID txUuid("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");
  NimBLEService *service = srv->createService(svc);
  NimBLECharacteristic *rx =
      service->createCharacteristic(rxUuid, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  static SrRxCallbacks rxCb;
  rx->setCallbacks(&rxCb);
  g_pTxChar = service->createCharacteristic(txUuid, NIMBLE_PROPERTY::NOTIFY);
  service->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(svc);
  adv->setName(advName);
  adv->start();
  g_bleRunning = true;
  ESP_LOGI(TAG_SR, "[BLE] provisioning, name=%s", advName);
}

static void factoryResetFromButton() {
  ESP_LOGI(TAG_SR, "[BOOT] long press -> clear WiFi & restart");
  prefsClearWifi();
  g_prefs.remove("mqtt_user");
  g_prefs.remove("mqtt_pass");
  stopBle();
  delay(200);
  esp_restart();
}

static void syncTimeIfNeeded() {
  static bool done = false;
  if (done || WiFi.status() != WL_CONNECTED) {
    return;
  }
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  for (int i = 0; i < 30; i++) {
    time_t now = time(nullptr);
    if (now > 1700000000) {
      done = true;
      return;
    }
    delay(300);
    esp_task_wdt_reset();
  }
}

void setup() {
  delay(200);
  esp_task_wdt_init(30, true);
  esp_task_wdt_add(nullptr);

  pinMode(PIN_RELAY, OUTPUT);
  relayApply(false);
  pinMode(PIN_BOOT, INPUT_PULLUP);

  loadDeviceSn();
  ESP_LOGI(TAG_SR, "[SN] device_sn=%s clientId=%s", g_deviceSn, g_clientId);

  g_prefs.begin(kNs, false);

  g_mqtt.begin(CFG_MQTT_HOST, CFG_MQTT_PORT, g_wifiClient);
  g_mqtt.onMessage(onMqttMessage);

  if (!prefsHasWifi()) {
    ledSetMode(LedMode::FastBlink);
    startBleProvisioning();
    return;
  }

  ledSetMode(LedMode::FastBlink);
  WiFi.mode(WIFI_STA);
  String ssid = g_prefs.getString("wifi_ssid", "");
  String pass = g_prefs.getString("wifi_pass", "");
  WiFi.begin(ssid.c_str(), pass.c_str());
  uint32_t wstart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wstart < 20000) {
    delay(200);
    esp_task_wdt_reset();
  }
  if (WiFi.status() != WL_CONNECTED) {
    ESP_LOGI(TAG_SR, "[WiFi] connect failed -> provisioning");
    prefsClearWifi();
    startBleProvisioning();
    return;
  }
  ESP_LOGI(TAG_SR, "[WiFi] ip=%s", WiFi.localIP().toString().c_str());
  syncTimeIfNeeded();

  uint32_t mq = millis();
  while (!mqttConnect() && millis() - mq < 25000) {
    ESP_LOGI(TAG_SR, "[MQTT] retry connect...");
    delay(500);
    esp_task_wdt_reset();
  }
  if (!g_mqtt.connected()) {
    ESP_LOGI(TAG_SR, "[MQTT] failed, will retry in loop");
  } else {
    ledSetMode(LedMode::Breath);
  }
}

void loop() {
  esp_task_wdt_reset();

  const bool bootDown = (digitalRead(PIN_BOOT) == LOW);
  if (bootDown) {
    if (!g_bootWasDown) {
      g_bootDownMs = millis();
    }
    g_bootWasDown = true;
    if (millis() - g_bootDownMs >= BOOT_LONG_PRESS_MS) {
      factoryResetFromButton();
    }
  } else {
    g_bootWasDown = false;
  }

  if (prefsHasWifi() == false && g_bleRunning) {
    ledTick();
    delay(5);
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    syncTimeIfNeeded();
    g_mqtt.loop();
    mqttEnsure();

    if (g_mqtt.connected()) {
      if (g_ledMode != LedMode::Breath) {
        ledSetMode(LedMode::Breath);
      }
      const uint32_t now = millis();
      if (now - g_lastTelem >= TELEMETRY_INTERVAL_MS) {
        g_lastTelem = now;
        publishTelemetry();
      }
    } else {
      if (g_ledMode != LedMode::FastBlink) {
        ledSetMode(LedMode::FastBlink);
      }
    }
  } else if (prefsHasWifi()) {
    static uint32_t lastWifiTry = 0;
    if (millis() - lastWifiTry > 5000) {
      lastWifiTry = millis();
      WiFi.reconnect();
      ESP_LOGI(TAG_SR, "[WiFi] reconnecting...");
    }
    if (g_ledMode != LedMode::FastBlink) {
      ledSetMode(LedMode::FastBlink);
    }
  }

  ledTick();
  delay(5);
}
