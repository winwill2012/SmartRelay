#pragma once

#include "driver/gpio.h"

/** 固件版本 — OTA 后 report.fw_version 与此一致 */
#define FW_VERSION "1.0.0"

#define PIN_RELAY GPIO_NUM_4
#define PIN_LED GPIO_NUM_8
#define PIN_BOOT GPIO_NUM_9

#define BOOT_CLEAR_MS 5000
#define HEARTBEAT_INTERVAL_MS 3000
#define BLE_NAME_PREFIX "SR-"

#ifndef MQTT_HOST
#define MQTT_HOST "119.29.197.186"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USER
#define MQTT_USER "SmartRelay"
#endif
#ifndef MQTT_PASS
#define MQTT_PASS "314159!@$%^"
#endif
