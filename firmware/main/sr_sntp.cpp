#include "sr_sntp.h"
#include "esp_log.h"
#include "esp_sntp.h"
#include <sys/time.h>
#include <ctime>

static const char *TAG = "sr_sntp";
static bool s_synced;

static void on_sync(struct timeval *tv) {
  (void)tv;
  s_synced = true;
  ESP_LOGI(TAG, "SNTP synced");
}

void sr_sntp_start(void) {
  s_synced = false;
  setenv("TZ", "CST-8", 1);
  tzset();
  esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
  esp_sntp_setservername(0, "ntp.aliyun.com");
  esp_sntp_setservername(1, "pool.ntp.org");
  esp_sntp_setservername(2, "time.windows.com");
  esp_sntp_set_time_sync_notification_cb(on_sync);
  esp_sntp_init();
}

bool sr_time_ready(void) {
  time_t now = 0;
  time(&now);
  return s_synced || now > 1700000000;
}
