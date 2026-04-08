#pragma once

// 硬件（ESP32-C3 常见 DevKit；BOOT 若与板卡不符请改此处）
#define PIN_LED 8
#define PIN_RELAY 4
#define PIN_BOOT 9

#define BOOT_LONG_PRESS_MS 5000
#define TELEMETRY_INTERVAL_MS 5000
#define WIFI_CONNECT_ATTEMPT_MS 15000

// 与 resource.md / 运维约定一致；勿将真实密码提交公开仓库（本地改此文件或见 README）
#define CFG_MQTT_HOST "119.29.197.186"
#define CFG_MQTT_PORT 1883
#define CFG_MQTT_USER "SmartRelay"
#define CFG_MQTT_PASS "PLEASE_SET_BEFORE_FLASH"
