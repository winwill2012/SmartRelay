#pragma once

#include "driver/gpio.h"

/** 固件版本 — OTA 后 report.fw_version 与此一致（可在 menuconfig 覆盖） */
#ifdef CONFIG_SR_FW_VERSION
#define FW_VERSION CONFIG_SR_FW_VERSION
#else
#define FW_VERSION "1.0.7"
#endif

#define PIN_RELAY GPIO_NUM_4
#define PIN_LED GPIO_NUM_8
#define PIN_BOOT GPIO_NUM_9

#define BOOT_CLEAR_MS 5000
#define HEARTBEAT_INTERVAL_MS 3000
#define BLE_NAME_PREFIX "SR-"

#ifdef CONFIG_SR_MQTT_HOST
#define MQTT_HOST CONFIG_SR_MQTT_HOST
#else
#define MQTT_HOST "127.0.0.1"
#endif

#ifdef CONFIG_SR_MQTT_PORT
#define MQTT_PORT CONFIG_SR_MQTT_PORT
#else
#define MQTT_PORT 1883
#endif

#ifdef CONFIG_SR_MQTT_USER
#define MQTT_USER CONFIG_SR_MQTT_USER
#else
#define MQTT_USER "SmartRelay"
#endif

#ifdef CONFIG_SR_MQTT_PASS
#define MQTT_PASS CONFIG_SR_MQTT_PASS
#else
#define MQTT_PASS "change_me"
#endif
