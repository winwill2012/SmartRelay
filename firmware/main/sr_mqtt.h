#pragma once

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*sr_mqtt_msg_cb_t)(const char *topic, size_t topic_len, const char *payload,
 size_t payload_len);

void sr_mqtt_init(const char *device_id, sr_mqtt_msg_cb_t on_data);
void sr_mqtt_start(void);
void sr_mqtt_stop_disconnect(void);
bool sr_mqtt_connected(void);
int sr_mqtt_publish(const char *topic, const char *data, size_t len, int qos, int retain);
void sr_mqtt_loop_hint(void);

const char *sr_mqtt_topic_cmd(void);
const char *sr_mqtt_topic_ota(void);
const char *sr_mqtt_topic_ack(void);
const char *sr_mqtt_topic_report(void);
const char *sr_mqtt_topic_otap(void);
const char *sr_mqtt_topic_lwt(void);

#ifdef __cplusplus
}
#endif
