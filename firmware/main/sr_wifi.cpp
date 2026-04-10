#include "sr_wifi.h"
#include "sr_nvs.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_timer.h"
#include <cstring>

static const char *TAG = "sr_wifi";
static bool s_ip_got;
static esp_netif_t *s_sta_netif;

static void on_wifi(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
  (void)base;
  (void)data;
  if (id == WIFI_EVENT_STA_DISCONNECTED) {
    s_ip_got = false;
    ESP_LOGW(TAG, "STA disconnected");
  }
}

static void on_ip(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
  (void)base;
  (void)data;
  if (id == IP_EVENT_STA_GOT_IP) {
    s_ip_got = true;
    ESP_LOGI(TAG, "got ip");
  }
}

void sr_wifi_init(void) {
  s_ip_got = false;
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  s_sta_netif = esp_netif_create_default_wifi_sta();
  (void)s_sta_netif;

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &on_wifi, nullptr));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &on_ip, nullptr));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());
  /* 关闭乐鑫 WiFi 库 tag「wifi」的 W级刷屏（如 Haven't to connect to a suitable AP）；业务日志仍用本文件 TAG「sr_wifi」 */
  esp_log_level_set("wifi", ESP_LOG_ERROR);
}

bool sr_wifi_has_ip(void) { return s_ip_got; }

int sr_wifi_sta_rssi(void) {
  wifi_ap_record_t ap = {};
  if (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) return ap.rssi;
  return 0;
}

void sr_wifi_set_modem_sleep(bool on) {
  static int s_ps_mode = -1; /* -1 未设, 0 NONE, 1 MIN_MODEM */
  int want = on ? 1 : 0;
  if (want == s_ps_mode) return;
  s_ps_mode = want;
  esp_wifi_set_ps(on ? WIFI_PS_MIN_MODEM : WIFI_PS_NONE);
}

void sr_wifi_disconnect_clear(void) {
  s_ip_got = false;
  esp_wifi_disconnect();
}

void sr_wifi_begin(const char *ssid, const char *pass) {
  wifi_config_t w = {};
  strncpy((char *)w.sta.ssid, ssid ? ssid : "", sizeof(w.sta.ssid) - 1);
  strncpy((char *)w.sta.password, pass ? pass : "", sizeof(w.sta.password) - 1);
  w.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
  w.sta.bssid_set = false;
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &w));
  sr_wifi_set_modem_sleep(true);
  esp_wifi_connect();
}

void sr_wifi_begin_bssid(const char *ssid, const char *pass, int channel, const uint8_t bssid[6]) {
  wifi_config_t w = {};
  strncpy((char *)w.sta.ssid, ssid ? ssid : "", sizeof(w.sta.ssid) - 1);
  strncpy((char *)w.sta.password, pass ? pass : "", sizeof(w.sta.password) - 1);
  w.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
  if (channel > 0) w.sta.channel = (uint8_t)channel;
  if (bssid) {
    memcpy(w.sta.bssid, bssid, 6);
    w.sta.bssid_set = true;
  }
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &w));
  sr_wifi_set_modem_sleep(true);
  esp_wifi_connect();
}

void sr_wifi_boot_connect(const char *ssid, const char *pass, uint32_t timeout_ms) {
  sr_wifi_begin(ssid, pass);
  int64_t t0 = esp_timer_get_time() / 1000;
  while (!sr_wifi_has_ip() && (esp_timer_get_time() / 1000 - t0) < (int64_t)timeout_ms) {
    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

void sr_wifi_reconnect(void) { esp_wifi_connect(); }

void sr_wifi_pick_bssid_for_ssid(const char *ssid, uint8_t bssid[6], int *channel, bool *have) {
  *have = false;
  *channel = 0;
  memset(bssid, 0, 6);
  if (!ssid || !ssid[0]) return;

  if (esp_wifi_scan_start(nullptr, true) != ESP_OK) return;

  uint16_t n = 0;
  esp_wifi_scan_get_ap_num(&n);
  if (n == 0) return;
  wifi_ap_record_t *rec = (wifi_ap_record_t *)calloc(n, sizeof(wifi_ap_record_t));
  if (!rec) return;
  uint16_t m = n;
  if (esp_wifi_scan_get_ap_records(&m, rec) != ESP_OK) {
    free(rec);
    return;
  }
  int best = -128;
  for (int i = 0; i < m; i++) {
    if (strcmp((char *)rec[i].ssid, ssid) != 0) continue;
    int ch = rec[i].primary;
    if (ch < 1 || ch > 14) continue;
    if (rec[i].rssi > best) {
      best = rec[i].rssi;
      memcpy(bssid, rec[i].bssid, 6);
      *channel = ch;
      *have = true;
    }
  }
  free(rec);
}

void sr_wifi_heal_tick(bool prov_running, bool prov_pending, int *heal_attempt,
                       int64_t *last_heal_ms, int *last_status, int64_t *last_state_log_ms,
                       bool ble_active, void (*on_mqtt_disconnect)(void)) {
  if (prov_running || prov_pending) return;

  wifi_ap_record_t ap = {};
  int st = esp_wifi_sta_get_ap_info(&ap);
  int status = (st == ESP_OK) ? 3 : (s_ip_got ? 3 : 6);

  int64_t ms = esp_timer_get_time() / 1000;
  if (status != *last_status || (ms - *last_state_log_ms) >= 10000) {
    ESP_LOGI(TAG, "state=%d rssi=%d ip=%d", status, sr_wifi_sta_rssi(), s_ip_got ? 1 : 0);
    *last_status = status;
    *last_state_log_ms = ms;
  }

  if (st == ESP_OK && s_ip_got) {
    *heal_attempt = 0;
    if (!ble_active) sr_wifi_set_modem_sleep(false);
    return;
  }

  if (st == ESP_ERR_WIFI_NOT_CONNECT && (ms - *last_heal_ms) < 35000) return;
  if ((ms - *last_heal_ms) < 12000) return;

  *last_heal_ms = ms;
  (*heal_attempt)++;

  if (on_mqtt_disconnect) on_mqtt_disconnect();

  char ssid[64] = {0}, pass[64] = {0};
  if (!sr_nvs_get_str("wifi_ssid", ssid, sizeof(ssid)) || !ssid[0]) {
    ESP_LOGW(TAG, "heal: no saved credentials");
    return;
  }
  sr_nvs_get_str("wifi_pass", pass, sizeof(pass));

  int phase = *heal_attempt % 3;
  if (phase == 1) {
    ESP_LOGI(TAG, "heal reconnect()");
    sr_wifi_reconnect();
    return;
  }
  if (phase == 2) {
    ESP_LOGI(TAG, "heal disconnect+reconnect");
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(120));
    sr_wifi_reconnect();
    return;
  }
  ESP_LOGI(TAG, "heal begin ssid=%s", ssid);
  sr_wifi_set_modem_sleep(true);
  sr_wifi_begin(ssid, pass);
}
