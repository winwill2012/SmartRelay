#include "sr_ota.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_ota_ops.h"
#include "esp_crt_bundle.h"
#include "esp_rom_md5.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>
#include <cctype>

static const char *TAG = "sr_ota";

static int http_read_len(esp_http_client_handle_t c, void *dst, int max) {
  return esp_http_client_read(c, (char *)dst, max);
}

void sr_ota_https(const char *url, const char *md5expect32, size_t size_hint, sr_ota_progress_cb_t on_prog) {
  if (!url || !url[0]) return;
  if (on_prog) on_prog(0, "download");

  esp_http_client_config_t cfg = {};
  cfg.url = url;
  cfg.timeout_ms = 30000;
  bool is_https = (strncmp(url, "https://", 8) == 0);
  if (is_https) {
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.skip_cert_common_name_check = true;
  }

  esp_http_client_handle_t client = esp_http_client_init(&cfg);
  if (!client) return;
  if (esp_http_client_open(client, 0) != ESP_OK) {
    esp_http_client_cleanup(client);
    return;
  }
  int64_t cl = esp_http_client_fetch_headers(client);
  int total = (int)cl;
  if (total <= 0 && size_hint > 0) total = (int)size_hint;
  if (total <= 0) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }

  const esp_partition_t *upd = esp_ota_get_next_update_partition(nullptr);
  if (!upd) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }
  esp_ota_handle_t oh = 0;
  if (esp_ota_begin(upd, (size_t)total, &oh) != ESP_OK) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }

  md5_context_t md5ctx;
  esp_rom_md5_init(&md5ctx);

  uint8_t buf[1024];
  size_t done = 0;
  while (done < (size_t)total) {
    int toread = (int)sizeof(buf);
    if ((size_t)toread > (size_t)total - done) toread = (int)((size_t)total - done);
    int rd = http_read_len(client, buf, toread);
    if (rd <= 0) break;
    esp_rom_md5_update(&md5ctx, buf, (uint32_t)rd);
    if (esp_ota_write(oh, buf, (size_t)rd) != ESP_OK) {
      esp_ota_abort(oh);
      esp_http_client_close(client);
      esp_http_client_cleanup(client);
      return;
    }
    done += (size_t)rd;
    if (total > 0 && on_prog) on_prog((int)(done * 100 / (size_t)total), "download");
  }

  uint8_t md5bin[ESP_ROM_MD5_DIGEST_LEN];
  esp_rom_md5_final(md5bin, &md5ctx);

  char hex[33];
  for (int i = 0; i < 16; i++) sprintf(hex + i * 2, "%02x", md5bin[i]);
  hex[32] = 0;

  if (md5expect32 && strlen(md5expect32) == 32) {
    bool match = true;
    for (int i = 0; i < 32 && match; i++) {
      char a = tolower((unsigned char)hex[i]);
      char b = tolower((unsigned char)md5expect32[i]);
      if (a != b) match = false;
    }
    if (!match) {
      ESP_LOGE(TAG, "md5 mismatch");
      esp_ota_abort(oh);
      esp_http_client_close(client);
      esp_http_client_cleanup(client);
      return;
    }
  }

  if (esp_ota_end(oh) != ESP_OK) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }
  esp_http_client_close(client);
  esp_http_client_cleanup(client);

  if (esp_ota_set_boot_partition(upd) != ESP_OK) return;
  if (on_prog) on_prog(100, "done");
  vTaskDelay(pdMS_TO_TICKS(200));
  esp_restart();
}
