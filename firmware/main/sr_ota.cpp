#include "sr_ota.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_ota_ops.h"
#include "esp_crt_bundle.h"
#include "esp_rom_md5.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstdio>
#include <cstring>
#include <cctype>

static const char *TAG = "sr_ota";

static int http_read_len(esp_http_client_handle_t c, void *dst, int max) {
  return esp_http_client_read(c, (char *)dst, max);
}

/** esp_http_client 对无协议或大小写异常的 URL 会报 invalid host；与后端仅配域名时对齐 */
static bool ota_normalize_url(const char *url_in, char *out, size_t cap) {
  if (!url_in || !out || cap < 32) return false;
  while (*url_in && (unsigned char)(*url_in) <= 0x20) url_in++;
  size_t n = strlen(url_in);
  while (n > 0 && (unsigned char)url_in[n - 1] <= 0x20) n--;
  if (n == 0 || n + 12 >= cap) return false;
  memcpy(out, url_in, n);
  out[n] = 0;

  // 去头尾引号
  if (out[0] == '"' || out[0] == '\'') {
    memmove(out, out + 1, n);
    n = strlen(out);
  }
  while (n > 0 && (out[n - 1] == '"' || out[n - 1] == '\'' || (unsigned char)out[n - 1] <= 0x20)) {
    out[n - 1] = 0;
    n--;
  }

  // 去 UTF-8 BOM
  if (n >= 3 && (unsigned char)out[0] == 0xef && (unsigned char)out[1] == 0xbb && (unsigned char)out[2] == 0xbf) {
    memmove(out, out + 3, n - 3 + 1);
    n -= 3;
  }

  // 白名单重建：仅保留 URL 合法 ASCII，彻底剔除不可见/乱码字节
  // RFC3986 常见集合：ALPHA / DIGIT / -._~:/?#[]@!$&'()*+,;=%
  char cleaned[512];
  size_t w = 0;
  for (size_t i = 0; i < n && w + 1 < sizeof(cleaned); i++) {
    unsigned char c = (unsigned char)out[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '-' || c == '.' || c == '_' || c == '~' || c == ':' || c == '/' || c == '?' ||
              c == '#' || c == '[' || c == ']' || c == '@' || c == '!' || c == '$' || c == '&' ||
              c == '\'' || c == '(' || c == ')' || c == '*' || c == '+' || c == ',' || c == ';' ||
              c == '=' || c == '%';
    if (ok) cleaned[w++] = (char)c;
  }
  cleaned[w] = 0;
  if (w == 0) return false;
  strncpy(out, cleaned, cap - 1);
  out[cap - 1] = 0;
  n = strlen(out);

  // 若脏数据混在前缀中，优先从 http(s):// 起点重新截取
  {
    char lower[512];
    size_t ln = n < sizeof(lower) - 1 ? n : sizeof(lower) - 1;
    for (size_t i = 0; i < ln; i++) lower[i] = (char)tolower((unsigned char)out[i]);
    lower[ln] = 0;
    char *p_https = strstr(lower, "https://");
    char *p_http = strstr(lower, "http://");
    char *p = p_https ? p_https : p_http;
    if (p) {
      size_t idx = (size_t)(p - lower);
      if (idx > 0 && idx < n) {
        memmove(out, out + idx, n - idx + 1);
        n = strlen(out);
      }
    }
  }

  if (strncmp(out, "//", 2) == 0) {
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "https:%s", out);
    strncpy(out, tmp, cap - 1);
    out[cap - 1] = 0;
    n = strlen(out);
  } else if (!strstr(out, "://")) {
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "https://%s", out);
    strncpy(out, tmp, cap - 1);
    out[cap - 1] = 0;
    n = strlen(out);
  }
  char *scheme_end = strstr(out, "://");
  if (scheme_end) {
    for (char *p = out; p < scheme_end; p++) *p = (char)tolower((unsigned char)*p);
    char *host_begin = scheme_end + 3;
    char *path_sep = strchr(host_begin, '/');
    if (!path_sep) path_sep = out + strlen(out);
    char *last_q = nullptr;
    for (char *p = host_begin; p < path_sep; p++) {
      if (*p == '?') last_q = p;
    }
    if (last_q && last_q + 1 < path_sep) {
      char fixed[512];
      size_t prefix = (size_t)(host_begin - out);
      size_t remain = strlen(last_q + 1);
      if (prefix + remain + 1 < sizeof(fixed)) {
        memcpy(fixed, out, prefix);
        strcpy(fixed + prefix, last_q + 1);
        strncpy(out, fixed, cap - 1);
        out[cap - 1] = 0;
      }
    }
  }
  // 固件 URL 常规以 .bin 结尾；若后面挂脏字符，直接截断
  {
    const char *ext = strstr(out, ".bin");
    if (ext && ext[4] && ext[4] != '?') {
      out[(ext - out) + 4] = 0;
    }
  }
  return n > 0;
}

void sr_ota_https(const char *url, const char *md5expect32, size_t size_hint, sr_ota_progress_cb_t on_prog) {
  char url_norm[512];
  if (!url || !url[0]) {
    ESP_LOGE(TAG, "OTA abort: empty url");
    return;
  }
  if (!ota_normalize_url(url, url_norm, sizeof(url_norm))) {
    ESP_LOGE(TAG, "OTA abort: url normalize failed (too long or bad)");
    return;
  }
  ESP_LOGI(TAG, "OTA url norm prefix: %.120s", url_norm);
  ESP_LOGI(TAG, "OTA start (https=%d) size_hint=%u",
           strncmp(url_norm, "https://", 8) == 0 ? 1 : 0, (unsigned)size_hint);
  if (on_prog) on_prog(0, "download");

  esp_http_client_config_t cfg = {};
  cfg.url = url_norm;
  cfg.timeout_ms = 30000;
  bool is_https = (strncmp(url_norm, "https://", 8) == 0);
  if (is_https) {
    cfg.crt_bundle_attach = esp_crt_bundle_attach;
    cfg.skip_cert_common_name_check = true;
  }

  esp_http_client_handle_t client = esp_http_client_init(&cfg);
  if (!client) {
    ESP_LOGE(TAG, "OTA abort: http client init failed");
    return;
  }
  if (esp_http_client_open(client, 0) != ESP_OK) {
    ESP_LOGE(TAG, "OTA abort: http open failed (check URL / TLS / network)");
    esp_http_client_cleanup(client);
    return;
  }
  int64_t cl = esp_http_client_fetch_headers(client);
  int total = (int)cl;
  if (total <= 0 && size_hint > 0) total = (int)size_hint;
  if (total <= 0) {
    ESP_LOGE(TAG, "OTA abort: content-length=%lld hint=%u invalid", (long long)cl, (unsigned)size_hint);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }
  ESP_LOGI(TAG, "OTA download size=%d bytes", total);

  const esp_partition_t *upd = esp_ota_get_next_update_partition(nullptr);
  if (!upd) {
    ESP_LOGE(TAG, "OTA abort: no update partition");
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }
  esp_ota_handle_t oh = 0;
  if (esp_ota_begin(upd, (size_t)total, &oh) != ESP_OK) {
    ESP_LOGE(TAG, "OTA abort: esp_ota_begin failed");
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
      ESP_LOGE(TAG, "OTA abort: esp_ota_write failed at done=%u", (unsigned)done);
      esp_ota_abort(oh);
      esp_http_client_close(client);
      esp_http_client_cleanup(client);
      return;
    }
    done += (size_t)rd;
    if (total > 0 && on_prog) on_prog((int)(done * 100 / (size_t)total), "download");
  }
  if (done < (size_t)total) {
    ESP_LOGE(TAG, "OTA abort: short read done=%u expected=%d", (unsigned)done, total);
    esp_ota_abort(oh);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
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
      ESP_LOGE(TAG, "OTA abort: md5 mismatch (computed=%s)", hex);
      esp_ota_abort(oh);
      esp_http_client_close(client);
      esp_http_client_cleanup(client);
      return;
    }
    ESP_LOGI(TAG, "OTA md5 ok");
  }

  if (esp_ota_end(oh) != ESP_OK) {
    ESP_LOGE(TAG, "OTA abort: esp_ota_end failed");
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return;
  }
  esp_http_client_close(client);
  esp_http_client_cleanup(client);

  if (esp_ota_set_boot_partition(upd) != ESP_OK) {
    ESP_LOGE(TAG, "OTA abort: set boot partition failed");
    return;
  }
  ESP_LOGI(TAG, "OTA success, rebooting…");
  if (on_prog) on_prog(100, "done");
  vTaskDelay(pdMS_TO_TICKS(200));
  esp_restart();
}
