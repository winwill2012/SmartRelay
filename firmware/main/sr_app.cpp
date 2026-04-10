#include "sr_app.h"
#include "sr_config.h"
#include "sr_nvs.h"
#include "sr_led.h"
#include "sr_relay.h"
#include "sr_wifi.h"
#include "sr_sntp.h"
#include "sr_mqtt.h"
#include "sr_schedule.h"
#include "sr_ota.h"
#include "sr_ble.h"
#include "cJSON.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "esp_task_wdt.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <string>

static const char *TAG = "sr_app";

static char s_device_id[24];
static char s_ble_name[16];
static std::string s_rx_plain;
static std::string s_rx_framed;
static std::string s_prov_ssid;
static std::string s_prov_pass;
static volatile bool s_prov_pending;
static volatile bool s_prov_running;
static uint32_t s_prov_seq;
static int64_t s_last_hb;
static int64_t s_last_sched;
static int s_wifi_heal;
static int64_t s_last_wifi_heal;
static int s_last_wifi_st;
static int64_t s_last_wifi_log;
static int64_t s_last_mqtt_try;
static int64_t s_last_mqtt_fail_log;
static int s_mqtt_fail_streak;
static bool s_prev_wifi;
static int64_t s_mqtt_off_since;
static bool s_prev_mqtt;
static int64_t s_boot_press;
static volatile bool s_ota_busy;
static bool s_ble_runtime_active;

static int64_t now_ms(void) { return esp_timer_get_time() / 1000; }

static void log_prov(uint32_t seq, const char *stage, const char *detail) {
  if (detail && detail[0])
    ESP_LOGI(TAG, "[PROV#%lu][%lld ms][%s] %s", (unsigned long)seq, (long long)now_ms(), stage, detail);
  else
    ESP_LOGI(TAG, "[PROV#%lu][%lld ms][%s]", (unsigned long)seq, (long long)now_ms(), stage);
}

static bool topic_eq(const char *topic, size_t topic_len, const char *exp) {
  size_t el = strlen(exp);
  return topic_len == el && strncmp(topic, exp, el) == 0;
}

static void publish_report(bool from_sched, int64_t sid, const char *sact, const char *reason) {
  if (!sr_mqtt_connected()) return;
  cJSON *o = cJSON_CreateObject();
  cJSON_AddNumberToObject(o, "ts", (double)now_ms());
  cJSON_AddBoolToObject(o, "online", true);
  cJSON_AddBoolToObject(o, "relay_on", sr_relay_get());
  cJSON_AddNumberToObject(o, "rssi", sr_wifi_sta_rssi());
  cJSON_AddStringToObject(o, "fw_version", FW_VERSION);
  cJSON_AddNumberToObject(o, "schedule_revision", (double)sr_schedule_revision());
  if (from_sched) {
    cJSON_AddStringToObject(o, "report_reason", "schedule");
    if (sid) cJSON_AddNumberToObject(o, "schedule_id", (double)sid);
    if (sact && sact[0]) cJSON_AddStringToObject(o, "schedule_action", sact);
  } else if (reason && reason[0]) {
    cJSON_AddStringToObject(o, "report_reason", reason);
  }
  char *js = cJSON_PrintUnformatted(o);
  cJSON_Delete(o);
  if (js) {
    sr_mqtt_publish(sr_mqtt_topic_report(), js, strlen(js), 1, 0);
    cJSON_free(js);
  }
}

/** 每次上电后首次 MQTT 连通时带 report_reason=boot，便于服务端统计各版本设备量 */
static bool s_boot_fw_report_sent;
static void publish_report_on_mqtt_connected_edge(void) {
  if (!sr_mqtt_connected()) return;
  if (!s_boot_fw_report_sent) {
    s_boot_fw_report_sent = true;
    publish_report(false, 0, nullptr, "boot");
  } else {
    publish_report(false, 0, nullptr, nullptr);
  }
}

static void publish_lwt_online(void) {
  if (!sr_mqtt_connected()) return;
  cJSON *o = cJSON_CreateObject();
  cJSON_AddBoolToObject(o, "online", true);
  cJSON_AddNumberToObject(o, "ts", (double)now_ms());
  char *js = cJSON_PrintUnformatted(o);
  cJSON_Delete(o);
  if (js) {
    sr_mqtt_publish(sr_mqtt_topic_lwt(), js, strlen(js), 1, 1);
    cJSON_free(js);
  }
}

static void publish_ack_ok(const char *cmd_id, cJSON *applied) {
  if (!sr_mqtt_connected() || !cmd_id || !cmd_id[0]) return;
  cJSON *o = cJSON_CreateObject();
  cJSON_AddStringToObject(o, "cmd_id", cmd_id);
  cJSON_AddNumberToObject(o, "ts", (double)now_ms());
  cJSON_AddBoolToObject(o, "success", true);
  cJSON_AddNullToObject(o, "error_code");
  cJSON_AddNullToObject(o, "error_message");
  if (applied)
    cJSON_AddItemToObject(o, "applied", applied);
  else
    cJSON_AddObjectToObject(o, "applied");
  char *js = cJSON_PrintUnformatted(o);
  cJSON_Delete(o);
  if (js) {
    sr_mqtt_publish(sr_mqtt_topic_ack(), js, strlen(js), 1, 0);
    cJSON_free(js);
  }
}

static void publish_ack_err(const char *cmd_id, int code, const char *msg) {
  if (!sr_mqtt_connected() || !cmd_id || !cmd_id[0]) return;
  cJSON *o = cJSON_CreateObject();
  cJSON_AddStringToObject(o, "cmd_id", cmd_id);
  cJSON_AddNumberToObject(o, "ts", (double)now_ms());
  cJSON_AddBoolToObject(o, "success", false);
  cJSON_AddNumberToObject(o, "error_code", code);
  cJSON_AddStringToObject(o, "error_message", msg ? msg : "");
  char *js = cJSON_PrintUnformatted(o);
  cJSON_Delete(o);
  if (js) {
    sr_mqtt_publish(sr_mqtt_topic_ack(), js, strlen(js), 1, 0);
    cJSON_free(js);
  }
}

static void publish_ota_progress(int pct, const char *phase) {
  if (!sr_mqtt_connected()) return;
  cJSON *o = cJSON_CreateObject();
  cJSON_AddNumberToObject(o, "ts", (double)now_ms());
  cJSON_AddNumberToObject(o, "percent", pct);
  cJSON_AddStringToObject(o, "phase", phase ? phase : "");
  char *js = cJSON_PrintUnformatted(o);
  cJSON_Delete(o);
  if (js) {
    sr_mqtt_publish(sr_mqtt_topic_otap(), js, strlen(js), 1, 0);
    cJSON_free(js);
  }
}

static void wait_ip_ms(uint32_t ms) {
  int64_t t0 = now_ms();
  while (!sr_wifi_has_ip() && (now_ms() - t0) < (int64_t)ms) {
    vTaskDelay(pdMS_TO_TICKS(200));
    esp_task_wdt_reset();
  }
}

/** sr_wifi_begin / begin_bssid 内会打开 MIN_MODEM；配网阶段覆盖为 PS_NONE，减轻 C3 单天线与 BLE 并发时关联失败 */
static void prov_connect_plain(const char *ssid, const char *pass) {
  sr_wifi_begin(ssid, pass);
  sr_wifi_set_modem_sleep(false);
}

static void prov_connect_bssid(const char *ssid, const char *pass, int channel, const uint8_t bssid[6]) {
  sr_wifi_begin_bssid(ssid, pass, channel, bssid);
  sr_wifi_set_modem_sleep(false);
}

static void run_wifi_provisioning(const char *ssid, const char *pass) {
  uint32_t seq = ++s_prov_seq;
  s_prov_running = true;
  log_prov(seq, "START", "run_wifi_provisioning");

  sr_ble_stop_advertising();
  vTaskDelay(pdMS_TO_TICKS(120));
  sr_ble_relax_conn_for_wifi_coex();
  vTaskDelay(pdMS_TO_TICKS(300));

  esp_wifi_disconnect();
  vTaskDelay(pdMS_TO_TICKS(300));
  sr_wifi_provision_session_begin();
  /* 先不关 PS：由每次 connect 后强制 NONE，避免未连上 AP 就进 modem sleep */

  uint8_t bssid[6];
  int ch = 0;
  bool have_b = false;

  log_prov(seq, "WIFI", "begin #1 (no pre-scan, coexist)");
  prov_connect_plain(ssid, pass);
  wait_ip_ms(40000);

  if (!sr_wifi_has_ip()) {
    log_prov(seq, "WIFI", "scan for bssid");
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(400));
    sr_wifi_pick_bssid_for_ssid(ssid, bssid, &ch, &have_b);
    vTaskDelay(pdMS_TO_TICKS(200));
  }

  if (!sr_wifi_has_ip() && have_b && ch > 0) {
    log_prov(seq, "WIFI", "retry#2 bssid");
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(400));
    prov_connect_bssid(ssid, pass, ch, bssid);
    wait_ip_ms(40000);
  }

  if (!sr_wifi_has_ip()) {
    log_prov(seq, "WIFI", "retry#3 plain");
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(400));
    prov_connect_plain(ssid, pass);
    wait_ip_ms(40000);
  }

  if (!sr_wifi_has_ip()) {
    log_prov(seq, "WIFI", "retry#4 wifi stop/start");
    esp_wifi_stop();
    vTaskDelay(pdMS_TO_TICKS(250));
    esp_wifi_start();
    vTaskDelay(pdMS_TO_TICKS(250));
    sr_wifi_provision_reapply_phy_after_wifi_reset();
    prov_connect_plain(ssid, pass);
    wait_ip_ms(35000);
  }

  cJSON *res = cJSON_CreateObject();
  cJSON_AddStringToObject(res, "type", "wifi.result");

  if (sr_wifi_has_ip()) {
    vTaskDelay(pdMS_TO_TICKS(120));
    cJSON_AddBoolToObject(res, "ok", true);
    esp_netif_ip_info_t ip = {};
    esp_netif_t *net = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    char ipstr[20] = "0.0.0.0";
    if (net && esp_netif_get_ip_info(net, &ip) == ESP_OK) {
      esp_ip4addr_ntoa(&ip.ip, ipstr, sizeof(ipstr));
    }
    cJSON_AddStringToObject(res, "ip", ipstr);
    cJSON_AddStringToObject(res, "device_id", s_device_id);
    uint8_t m[6];
    esp_read_mac(m, ESP_MAC_WIFI_STA);
    char mac[20];
    snprintf(mac, sizeof(mac), "%02X:%02X:%02X:%02X:%02X:%02X", m[0], m[1], m[2], m[3], m[4], m[5]);
    cJSON_AddStringToObject(res, "mac", mac);
    cJSON_AddStringToObject(res, "fw_version", FW_VERSION);
    sr_nvs_set_str("wifi_ssid", ssid);
    sr_nvs_set_str("wifi_pass", pass ? pass : "");
    sr_sntp_start();
    setenv("TZ", "CST-8", 1);
    tzset();
  } else {
    cJSON_AddBoolToObject(res, "ok", false);
    cJSON_AddStringToObject(res, "error", "wifi_connect_failed");
    cJSON_AddNumberToObject(res, "wifi_status", 6);
    cJSON_AddStringToObject(res, "hint",
                            "WiFi connect failed: check 2.4G SSID/password and router security mode");
  }

  char *out = cJSON_PrintUnformatted(res);
  cJSON_Delete(res);
  vTaskDelay(pdMS_TO_TICKS(400));
  log_prov(seq, "BLE", "notify wifi.result");
  if (out) {
    sr_ble_notify_json(out);
    cJSON_free(out);
  }

  if (sr_wifi_has_ip()) {
    vTaskDelay(pdMS_TO_TICKS(220));
    sr_ble_deinit_after_provision();
    s_ble_runtime_active = false;
    sr_wifi_set_modem_sleep(false);
    log_prov(seq, "END", "success deinit BLE");
  } else {
    sr_ble_start_advertising();
    log_prov(seq, "END", "failed restart adv");
  }
  sr_wifi_provision_session_end();
  s_prov_running = false;
}

static void handle_wifi_set(const char *ssid, const char *pass) {
  if (!ssid || !ssid[0]) return;
  if (s_prov_running) {
    cJSON *res = cJSON_CreateObject();
    cJSON_AddStringToObject(res, "type", "wifi.result");
    cJSON_AddBoolToObject(res, "ok", false);
    cJSON_AddStringToObject(res, "error", "wifi_provision_busy");
    cJSON_AddStringToObject(res, "hint", "设备正在配网中，请稍后再试");
    cJSON_AddNumberToObject(res, "wifi_status", sr_wifi_has_ip() ? 3 : 6);
    char *js = cJSON_PrintUnformatted(res);
    cJSON_Delete(res);
    if (js) {
      sr_ble_notify_json(js);
      cJSON_free(js);
    }
    return;
  }
  s_prov_ssid = ssid;
  s_prov_pass = pass ? pass : "";
  s_prov_pending = true;
}

static void handle_ble_json(cJSON *root) {
  if (!root) return;
  cJSON *jt = cJSON_GetObjectItem(root, "type");
  const char *type = "";
  if (cJSON_IsString(jt) && jt->valuestring) type = jt->valuestring;

  cJSON *js = cJSON_GetObjectItem(root, "ssid");
  if ((!type || !type[0]) && cJSON_IsString(js) && js->valuestring) {
    cJSON *jp = cJSON_GetObjectItem(root, "password");
    const char *pw = "";
    if (cJSON_IsString(jp) && jp->valuestring) pw = jp->valuestring;
    handle_wifi_set(js->valuestring, pw);
    return;
  }

  if (!strcmp(type, "wifi.set")) {
    cJSON *jssid = cJSON_GetObjectItem(root, "ssid");
    cJSON *jpass = cJSON_GetObjectItem(root, "password");
    const char *ssid = (cJSON_IsString(jssid) && jssid->valuestring) ? jssid->valuestring : "";
    const char *p = (cJSON_IsString(jpass) && jpass->valuestring) ? jpass->valuestring : "";
    if (ssid[0]) handle_wifi_set(ssid, p);
    return;
  }
  if (!strcmp(type, "bind.prepare")) {
    cJSON *jt2 = cJSON_GetObjectItem(root, "token");
    if (cJSON_IsString(jt2) && jt2->valuestring && jt2->valuestring[0])
      sr_nvs_set_str("bind_token", jt2->valuestring);
  }
}

static void try_parse_plain_ble(void) {
  cJSON *doc = cJSON_Parse(s_rx_plain.c_str());
  if (!doc) {
    if (s_rx_plain.size() > 1200) s_rx_plain.clear();
    return;
  }
  s_rx_plain.clear();
  handle_ble_json(doc);
  cJSON_Delete(doc);
}

extern "C" void sr_app_ble_rx(const uint8_t *d, size_t len) {
  if (!d || !len) return;
  if (d[0] == '{') {
    s_rx_plain.assign((const char *)d, len);
    try_parse_plain_ble();
    return;
  }
  if (!s_rx_plain.empty()) {
    s_rx_plain.append((const char *)d, len);
    try_parse_plain_ble();
    return;
  }
  if (len < 3) return;
  bool last = (d[1] & 1) != 0;
  s_rx_framed.append((const char *)d + 2, len - 2);
  if (last) {
    cJSON *doc = cJSON_Parse(s_rx_framed.c_str());
    s_rx_framed.clear();
    if (doc) {
      handle_ble_json(doc);
      cJSON_Delete(doc);
    }
  }
}

static void on_mqtt_msg(const char *topic, size_t topic_len, const char *payload, size_t payload_len) {
  std::string pl(payload, payload + payload_len);
  cJSON *root = cJSON_Parse(pl.c_str());
  if (!root) return;

  cJSON *jcmd = cJSON_GetObjectItem(root, "cmd_id");
  const char *cmd_id = (cJSON_IsString(jcmd) && jcmd->valuestring) ? jcmd->valuestring : "";

  cJSON *jtype = cJSON_GetObjectItem(root, "type");
  const char *tp = (cJSON_IsString(jtype) && jtype->valuestring) ? jtype->valuestring : "";

  cJSON *pay = cJSON_GetObjectItem(root, "payload");

  if (topic_eq(topic, topic_len, sr_mqtt_topic_ota())) {
    cJSON *jt = cJSON_GetObjectItem(root, "type");
    if (cJSON_IsString(jt) && jt->valuestring) tp = jt->valuestring;
    else
      tp = "ota.start";
    pay = cJSON_GetObjectItem(root, "payload");
  }

  if (!strcmp(tp, "ping")) {
    publish_ack_ok(cmd_id, cJSON_CreateObject());
    cJSON_Delete(root);
    return;
  }

  if (!strcmp(tp, "relay.set")) {
    cJSON *on = pay ? cJSON_GetObjectItem(pay, "on") : nullptr;
    bool v = cJSON_IsBool(on) ? cJSON_IsTrue(on) : false;
    sr_relay_set(v);
    cJSON *ap = cJSON_CreateObject();
    cJSON_AddBoolToObject(ap, "relay_on", sr_relay_get());
    publish_ack_ok(cmd_id, ap);
    publish_report(false, 0, nullptr, nullptr);
    cJSON_Delete(root);
    return;
  }

  if (!strcmp(tp, "relay.toggle")) {
    sr_relay_set(!sr_relay_get());
    cJSON *ap = cJSON_CreateObject();
    cJSON_AddBoolToObject(ap, "relay_on", sr_relay_get());
    publish_ack_ok(cmd_id, ap);
    publish_report(false, 0, nullptr, nullptr);
    cJSON_Delete(root);
    return;
  }

  if (!strcmp(tp, "ota.start")) {
    const char *url = "";
    const char *md5e = "";
    size_t sz = 0;
    if (pay && cJSON_IsObject(pay)) {
      cJSON *ju = cJSON_GetObjectItem(pay, "url");
      cJSON *jm = cJSON_GetObjectItem(pay, "md5");
      cJSON *jsz = cJSON_GetObjectItem(pay, "size");
      if (cJSON_IsString(ju) && ju->valuestring) url = ju->valuestring;
      if (cJSON_IsString(jm) && jm->valuestring) md5e = jm->valuestring;
      if (cJSON_IsNumber(jsz)) sz = (size_t)jsz->valuedouble;
    }
    if (!url[0]) {
      publish_ack_err(cmd_id, 40001, "bad_payload");
      cJSON_Delete(root);
      return;
    }
    publish_ack_ok(cmd_id, cJSON_CreateObject());
    cJSON_Delete(root);
    s_ota_busy = true;
    sr_ota_https(url, md5e, sz, publish_ota_progress);
    s_ota_busy = false;
    return;
  }

  if (!strcmp(tp, "schedule.sync")) {
    int64_t rev = 0;
    cJSON *sch = nullptr;
    if (pay && cJSON_IsObject(pay)) {
      cJSON *jr = cJSON_GetObjectItem(pay, "revision");
      if (cJSON_IsNumber(jr)) rev = (int64_t)jr->valuedouble;
      sch = cJSON_GetObjectItem(pay, "schedules");
    }
    cJSON *arr = (sch && cJSON_IsArray(sch)) ? cJSON_Duplicate(sch, 1) : cJSON_CreateArray();
    char *sj = cJSON_PrintUnformatted(arr);
    cJSON_Delete(arr);
    if (sj) {
      sr_schedule_save_json(sj, rev);
      cJSON_free(sj);
    }
    cJSON *ap = cJSON_CreateObject();
    cJSON_AddNumberToObject(ap, "schedule_revision", (double)sr_schedule_revision());
    publish_ack_ok(cmd_id, ap);
    publish_report(false, 0, nullptr, nullptr);
    cJSON_Delete(root);
    return;
  }

  publish_ack_err(cmd_id, 60002, "unknown_type");
  cJSON_Delete(root);
}

static void mqtt_wrap_cb(const char *topic, size_t topic_len, const char *payload, size_t payload_len) {
  on_mqtt_msg(topic, topic_len, payload, payload_len);
}

static void mqtt_reconnect_tick(void) {
  if (sr_mqtt_connected() || !sr_wifi_has_ip() || s_ota_busy) return;
  if (s_mqtt_off_since > 0 && (now_ms() - s_mqtt_off_since) < 1500) return;
  uint32_t backoff = 3000 + (uint32_t)(s_mqtt_fail_streak < 6 ? s_mqtt_fail_streak : 6) * 2000U;
  if ((now_ms() - s_last_mqtt_try) < (int64_t)backoff) return;
  s_last_mqtt_try = now_ms();
  ESP_LOGI(TAG, "mqtt reconnect backoff=%ums streak=%d", (unsigned)backoff, s_mqtt_fail_streak);
  sr_mqtt_stop_disconnect();
  sr_mqtt_start();
  s_mqtt_fail_streak++;
}

static void on_heal_mqtt_disconnect(void) { sr_mqtt_stop_disconnect(); }

void sr_app_main(void) {
  const esp_task_wdt_config_t twdt_cfg = {
      .timeout_ms = 30000,
      .idle_core_mask = 0,
      .trigger_panic = true,
  };
  /* 默认 sdkconfig 常开启 CONFIG_ESP_TASK_WDT_INIT，启动阶段已 init，重复 init 会 ESP_ERR_INVALID_STATE 直接导致重启 */
  esp_err_t wdt_err = esp_task_wdt_init(&twdt_cfg);
  if (wdt_err == ESP_ERR_INVALID_STATE) {
    ESP_ERROR_CHECK(esp_task_wdt_reconfigure(&twdt_cfg));
  } else {
    ESP_ERROR_CHECK(wdt_err);
  }
  esp_task_wdt_add(nullptr);

  gpio_config_t boot = {};
  boot.pin_bit_mask = 1ULL << PIN_BOOT;
  boot.mode = GPIO_MODE_INPUT;
  boot.pull_up_en = GPIO_PULLUP_ENABLE;
  gpio_config(&boot);

  sr_relay_init();
  sr_led_init();
  sr_led_set_mode(SR_LED_PROVISION);

  ESP_ERROR_CHECK(nvs_flash_init());
  sr_schedule_load();

  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(s_device_id, sizeof(s_device_id), "SR-%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3],
           mac[4], mac[5]);
  snprintf(s_ble_name, sizeof(s_ble_name), "SR-%02X%02X", mac[4], mac[5]);

  sr_wifi_init();

  char ssid[64] = {0}, pass[64] = {0};
  bool boot_ip = false;
  if (sr_nvs_get_str("wifi_ssid", ssid, sizeof(ssid)) && ssid[0] && sr_nvs_get_str("wifi_pass", pass, sizeof(pass))) {
    ESP_LOGI(TAG, "boot: saved ssid=%s", ssid);
    sr_wifi_begin(ssid, pass);
    wait_ip_ms(30000);
    boot_ip = sr_wifi_has_ip();
    if (boot_ip) {
      ESP_LOGI(TAG, "boot: wifi ok");
      sr_sntp_start();
      setenv("TZ", "CST-8", 1);
      tzset();
      sr_wifi_set_modem_sleep(false);
    }
  } else {
    ESP_LOGI(TAG, "boot: no wifi nvs");
  }

  s_ble_runtime_active = !boot_ip;
  if (s_ble_runtime_active) {
    ESP_ERROR_CHECK(sr_ble_init(s_ble_name));
    sr_ble_set_write_cb(sr_app_ble_rx);
  } else {
    ESP_LOGW(TAG,
             "BLE 未启动：NVS 已有 WiFi 且已联网。添加设备需配网模式——长按 BOOT %ds 清 WiFi 后重启，LED 快闪时再小程序搜索 SR-xxxx",
             BOOT_CLEAR_MS / 1000);
  }

  sr_mqtt_init(s_device_id, mqtt_wrap_cb);
  if (boot_ip) {
    sr_mqtt_start();
    s_prev_mqtt = false;
  }

  s_last_hb = now_ms();
  s_last_sched = now_ms();
  s_prev_wifi = boot_ip;

  for (;;) {
    esp_task_wdt_reset();

    if (s_prov_pending) {
      s_prov_pending = false;
      std::string s = s_prov_ssid;
      std::string p = s_prov_pass;
      run_wifi_provisioning(s.c_str(), p.c_str());
      if (sr_wifi_has_ip()) {
        sr_mqtt_start();
        sr_led_set_mode(SR_LED_BREATH);
      }
    }

    if (gpio_get_level(PIN_BOOT) == 0) {
      if (s_boot_press == 0) s_boot_press = now_ms();
      else if ((now_ms() - s_boot_press) >= BOOT_CLEAR_MS) {
        sr_nvs_clear_wifi();
        vTaskDelay(pdMS_TO_TICKS(200));
        esp_restart();
      }
    } else
      s_boot_press = 0;

    sr_wifi_heal_tick(s_prov_running, s_prov_pending, &s_wifi_heal, &s_last_wifi_heal, &s_last_wifi_st,
                      &s_last_wifi_log, s_ble_runtime_active, on_heal_mqtt_disconnect);

    bool wifi_now = sr_wifi_has_ip();
    if (wifi_now && !s_prev_wifi) {
      ESP_LOGI(TAG, "wifi -> connected");
      s_last_mqtt_try = 0;
      s_mqtt_off_since = now_ms();
      sr_mqtt_start();
    }
    s_prev_wifi = wifi_now;

    if (wifi_now) {
      bool mqtt_now = sr_mqtt_connected();
      if (mqtt_now) {
        s_mqtt_off_since = 0;
        s_mqtt_fail_streak = 0;
      } else {
        if (s_mqtt_off_since == 0) s_mqtt_off_since = now_ms();
        if ((now_ms() - s_last_mqtt_fail_log) > 5000) {
          s_last_mqtt_fail_log = now_ms();
          ESP_LOGW(TAG, "mqtt waiting reconnect");
        }
        mqtt_reconnect_tick();
      }

      mqtt_now = sr_mqtt_connected();
      if (mqtt_now != s_prev_mqtt) {
        ESP_LOGI(TAG, "mqtt -> %s", mqtt_now ? "up" : "down");
        if (mqtt_now) {
          publish_lwt_online();
          publish_report_on_mqtt_connected_edge();
          sr_led_set_mode(SR_LED_BREATH);
        }
        s_prev_mqtt = mqtt_now;
      }

      if (!s_ota_busy && sr_mqtt_connected() && (now_ms() - s_last_hb) >= HEARTBEAT_INTERVAL_MS) {
        s_last_hb = now_ms();
        publish_report(false, 0, nullptr, nullptr);
      }

      if (sr_mqtt_connected() && sr_time_ready() && (now_ms() - s_last_sched) >= 10000) {
        s_last_sched = now_ms();
        bool fs = false;
        int64_t sid = 0;
        char act[16] = {0};
        if (sr_schedule_tick(&fs, &sid, act, sizeof(act))) {
          publish_report(fs, sid, act[0] ? act : nullptr, nullptr);
        }
      }
    }

    sr_led_tick();
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}
