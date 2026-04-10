#include "sr_nvs.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <cstring>

static const char *k_ns = "sr";

bool sr_nvs_get_str(const char *key, char *out, size_t out_sz) {
  if (!out || out_sz == 0) return false;
  out[0] = '\0';
  nvs_handle_t h;
  if (nvs_open(k_ns, NVS_READONLY, &h) != ESP_OK) return false;
  size_t sz = 0;
  esp_err_t e = nvs_get_str(h, key, nullptr, &sz);
  if (e != ESP_OK || sz == 0 || sz > out_sz) {
    nvs_close(h);
    return false;
  }
  e = nvs_get_str(h, key, out, &sz);
  nvs_close(h);
  return e == ESP_OK;
}

void sr_nvs_set_str(const char *key, const char *val) {
  nvs_handle_t h;
  if (nvs_open(k_ns, NVS_READWRITE, &h) != ESP_OK) return;
  nvs_set_str(h, key, val ? val : "");
  nvs_commit(h);
  nvs_close(h);
}

void sr_nvs_erase_key(const char *key) {
  nvs_handle_t h;
  if (nvs_open(k_ns, NVS_READWRITE, &h) != ESP_OK) return;
  nvs_erase_key(h, key);
  nvs_commit(h);
  nvs_close(h);
}

void sr_nvs_clear_wifi(void) {
  sr_nvs_erase_key("wifi_ssid");
  sr_nvs_erase_key("wifi_pass");
}

bool sr_nvs_get_i64(const char *key, int64_t *out) {
  if (!out) return false;
  nvs_handle_t h;
  if (nvs_open(k_ns, NVS_READONLY, &h) != ESP_OK) return false;
  esp_err_t e = nvs_get_i64(h, key, out);
  nvs_close(h);
  return e == ESP_OK;
}

void sr_nvs_set_i64(const char *key, int64_t val) {
  nvs_handle_t h;
  if (nvs_open(k_ns, NVS_READWRITE, &h) != ESP_OK) return;
  nvs_set_i64(h, key, val);
  nvs_commit(h);
  nvs_close(h);
}
