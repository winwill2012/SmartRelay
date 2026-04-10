#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void sr_wifi_init(void);
bool sr_wifi_has_ip(void);
int sr_wifi_sta_rssi(void);
void sr_wifi_boot_connect(const char *ssid, const char *pass, uint32_t timeout_ms);
void sr_wifi_disconnect_clear(void);
void sr_wifi_set_modem_sleep(bool on);
void sr_wifi_begin(const char *ssid, const char *pass);
void sr_wifi_begin_bssid(const char *ssid, const char *pass, int channel, const uint8_t bssid[6]);
void sr_wifi_reconnect(void);
void sr_wifi_heal_tick(bool prov_running, bool prov_pending, int *heal_attempt,
 int64_t *last_heal_ms, int *last_status, int64_t *last_state_log_ms,
                       bool ble_active, void (*on_mqtt_disconnect)(void));

/** 预扫描后按 RSSI 选 2.4G BSSID；返回 have_bssid */
void sr_wifi_pick_bssid_for_ssid(const char *ssid, uint8_t bssid[6], int *channel, bool *have);

/** BLE 配网流程内调用：射频/共存策略偏向 Wi-Fi，减轻 reason=2(AUTH_EXPIRE) 等握手失败 */
void sr_wifi_provision_session_begin(void);
void sr_wifi_provision_session_end(void);
/**在 esp_wifi_stop()+start() 后再次应用配网 PHY，否则协议能力可能回到默认 */
void sr_wifi_provision_reapply_phy_after_wifi_reset(void);

#ifdef __cplusplus
}
#endif
