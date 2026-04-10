#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*sr_ble_write_fn_t)(const uint8_t *data, size_t len);

esp_err_t sr_ble_init(const char *gap_name);
void sr_ble_set_write_cb(sr_ble_write_fn_t fn);
void sr_ble_notify_json(const char *json);
void sr_ble_stop_advertising(void);
void sr_ble_start_advertising(void);
bool sr_ble_stack_ready(void);
/** 配网连 Wi-Fi 前调用：请求拉大连接间隔，减轻 C3 单天线与 Wi-Fi 并发时 reason=2 */
void sr_ble_relax_conn_for_wifi_coex(void);
/** 配网成功后释放 BLE 控制器（与 Arduino NimBLE deinit 行为一致，利于 WiFi 独占射频） */
void sr_ble_deinit_after_provision(void);

#ifdef __cplusplus
}
#endif
