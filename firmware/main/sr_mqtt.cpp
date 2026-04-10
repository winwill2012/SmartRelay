#include "sr_mqtt.h"
#include "sr_config.h"
#include "esp_log.h"
#include "mqtt_client.h"
#include <cstring>
#include <cstdio>

static const char *TAG = "sr_mqtt";
static esp_mqtt_client_handle_t s_cli;
static sr_mqtt_msg_cb_t s_cb;
static char s_dev[20];
static char s_uri[160];
static char s_client_id[48];
static char s_topic_cmd[64];
static char s_topic_ota[64];
static char s_topic_ack[64];
static char s_topic_report[64];
static char s_topic_otap[64];
static char s_topic_lwt[56];
static bool s_connected;

static void build_topics(void) {
  snprintf(s_topic_cmd, sizeof(s_topic_cmd), "sr/v1/device/%s/cmd", s_dev);
  snprintf(s_topic_ota, sizeof(s_topic_ota), "sr/v1/device/%s/ota", s_dev);
  snprintf(s_topic_ack, sizeof(s_topic_ack), "sr/v1/device/%s/ack", s_dev);
  snprintf(s_topic_report, sizeof(s_topic_report), "sr/v1/device/%s/report", s_dev);
  snprintf(s_topic_otap, sizeof(s_topic_otap), "sr/v1/device/%s/ota/progress", s_dev);
  snprintf(s_topic_lwt, sizeof(s_topic_lwt), "sr/v1/device/%s/lwt", s_dev);
}

static void make_client_id(void) {
  snprintf(s_client_id, sizeof(s_client_id), "sr_");
  size_t k = strlen(s_client_id);
  for (size_t i = 0; s_dev[i] && k + 1 < sizeof(s_client_id); i++) {
    char c = s_dev[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))
      s_client_id[k++] = c;
    else
      s_client_id[k++] = '_';
  }
  s_client_id[k] = '\0';
}

static void handler(void *h, esp_event_base_t base, int32_t id, void *ev) {
  (void)h;
  (void)base;
  esp_mqtt_event_handle_t e = (esp_mqtt_event_handle_t)ev;
  switch ((esp_mqtt_event_id_t)id) {
  case MQTT_EVENT_CONNECTED:
    s_connected = true;
    ESP_LOGI(TAG, "connected");
    esp_mqtt_client_subscribe(s_cli, s_topic_cmd, 1);
    esp_mqtt_client_subscribe(s_cli, s_topic_ota, 1);
    break;
  case MQTT_EVENT_DISCONNECTED:
    s_connected = false;
    ESP_LOGW(TAG, "disconnected");
    break;
  case MQTT_EVENT_DATA:
    if (s_cb && e->topic && e->data) {
      s_cb(e->topic, e->topic_len, e->data, e->data_len);
    }
    break;
  default:
    break;
  }
}

extern "C" void sr_mqtt_init(const char *device_id, sr_mqtt_msg_cb_t on_data) {
  s_cb = on_data;
  strncpy(s_dev, device_id ? device_id : "", sizeof(s_dev) - 1);
  build_topics();
  make_client_id();
  snprintf(s_uri, sizeof(s_uri), "mqtt://" MQTT_HOST ":%d", MQTT_PORT);

  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.uri = s_uri;
  cfg.credentials.username = MQTT_USER;
  cfg.credentials.authentication.password = MQTT_PASS;
  cfg.session.last_will.topic = s_topic_lwt;
  cfg.session.last_will.msg = "{\"online\":false}";
  cfg.session.last_will.qos = 1;
  cfg.session.last_will.retain = true;
  cfg.session.keepalive = 30;
  cfg.network.disable_auto_reconnect = false;
  cfg.credentials.client_id = s_client_id;

  s_cli = esp_mqtt_client_init(&cfg);
  esp_mqtt_client_register_event(s_cli, MQTT_EVENT_ANY, handler, nullptr);
  s_connected = false;
}

extern "C" void sr_mqtt_start(void) {
  if (s_cli) esp_mqtt_client_start(s_cli);
}

extern "C" void sr_mqtt_stop_disconnect(void) {
  if (s_cli) esp_mqtt_client_disconnect(s_cli);
  s_connected = false;
}

extern "C" bool sr_mqtt_connected(void) { return s_connected; }

extern "C" int sr_mqtt_publish(const char *topic, const char *data, size_t len, int qos, int retain) {
  if (!s_cli || !topic) return -1;
  return esp_mqtt_client_publish(s_cli, topic, data, (int)len, qos, retain ? 1 : 0);
}

extern "C" void sr_mqtt_loop_hint(void) {}

extern "C" const char *sr_mqtt_topic_cmd(void) { return s_topic_cmd; }
extern "C" const char *sr_mqtt_topic_ota(void) { return s_topic_ota; }
extern "C" const char *sr_mqtt_topic_ack(void) { return s_topic_ack; }
extern "C" const char *sr_mqtt_topic_report(void) { return s_topic_report; }
extern "C" const char *sr_mqtt_topic_otap(void) { return s_topic_otap; }
extern "C" const char *sr_mqtt_topic_lwt(void) { return s_topic_lwt; }
