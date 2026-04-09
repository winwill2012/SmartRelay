#pragma once

/** 固件版本 — OTA 后 report.fw_version 与此一致 */
#define FW_VERSION "1.0.0"

/** 继电器：GPIO4，低电平有效（协议 relay_on=true → 引脚拉低） */
#define PIN_RELAY 4

/** 状态 LED：IO8；配网快闪，MQTT 已连接呼吸 */
#define PIN_LED 8

/** ESP32-C3-DevKitM-1 BOOT（长按 5s 清 WiFi / 重新配网） */
#define PIN_BOOT 9

#define BOOT_CLEAR_MS 5000

/** 心跳 / 遥测上报间隔（缩短以降低在线状态延迟） */
#define HEARTBEAT_INTERVAL_MS 3000

/** BLE 广播名前缀 §7：SR- */
#define BLE_NAME_PREFIX "SR-"

/**
 * MQTT Broker — 默认与项目 resource.md 一致；生产请改为安全配置或 NVS。
 * Topic 根：sr/v1/device/{device_id}/  — 《协议标准.md》§3
 */
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
