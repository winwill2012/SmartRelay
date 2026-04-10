#include "sr_ble.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "host/ble_uuid.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs_mbuf.h"
#include "os/os_mbuf.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include <string.h>

void ble_store_config_init(void);

static const char *TAG = "sr_ble";

/* 0000fff0 / fff1 / fff2 — 128-bit Bluetooth SIG base */
static const ble_uuid128_t sr_svc_uuid =
    BLE_UUID128_INIT(0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x10, 0x00, 0x00, 0xf0,
                     0xff, 0x00, 0x00);
static const ble_uuid128_t sr_rx_uuid =
    BLE_UUID128_INIT(0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x10, 0x00, 0x00, 0xf1,
                     0xff, 0x00, 0x00);
static const ble_uuid128_t sr_tx_uuid =
    BLE_UUID128_INIT(0xfb, 0x34, 0x9b, 0x5f, 0x80, 0x00, 0x00, 0x80, 0x00, 0x10, 0x00, 0x00, 0xf2,
                     0xff, 0x00, 0x00);

static uint16_t s_tx_val_handle;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t s_att_mtu = 23;
static char s_gap_name[32];
static sr_ble_write_fn_t s_wr;
static bool s_stack_inited;
/** 配网成功后主动 terminate + deinit：禁止在 DISCONNECT 里再启广播，否则与 nimble_port_stop 竞态，常见 ble_gap_adv_set_fields rc=30 (EALREADY) */
static bool s_teardown_silent;

static int sr_gatt_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt,
                          void *arg);
static void sr_gatt_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg);
static int sr_gap_event(struct ble_gap_event *event, void *arg);

static const struct ble_gatt_svc_def s_gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &sr_svc_uuid.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {
                    .uuid = &sr_rx_uuid.u,
                    .access_cb = sr_gatt_access,
                    .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
                },
                {
                    .uuid = &sr_tx_uuid.u,
                    .access_cb = sr_gatt_access,
                    .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
                    .val_handle = &s_tx_val_handle,
                },
                {
                    0,
                },
            },
    },
    {
        0,
    },
};

static void sr_advertise(void) {
  if (ble_gap_adv_active()) {
    (void)ble_gap_adv_stop();
  }

  /* 主广播：16 位 0xFFF0便于微信等栈填充 advertisServiceUUIDs；名称放扫描响应避免 31 字节装不下 */
  struct ble_hs_adv_fields fields;
  memset(&fields, 0, sizeof(fields));
  fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
  fields.tx_pwr_lvl_is_present = 1;
  fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;
  static const ble_uuid16_t adv_svc16 = BLE_UUID16_INIT(0xfff0);
  fields.uuids16 = &adv_svc16;
  fields.num_uuids16 = 1;
  fields.uuids16_is_complete = 1;

  struct ble_hs_adv_fields sr;
  memset(&sr, 0, sizeof(sr));
  sr.name = (uint8_t *)s_gap_name;
  sr.name_len = strlen(s_gap_name);
  sr.name_is_complete = 1;

  int rc = ble_gap_adv_set_fields(&fields);
  if (rc != 0) {
    ESP_LOGE(TAG, "adv_set_fields rc=%d", rc);
    return;
  }
  rc = ble_gap_adv_rsp_set_fields(&sr);
  if (rc != 0) {
    ESP_LOGE(TAG, "adv_rsp_set_fields rc=%d", rc);
    return;
  }

  struct ble_gap_adv_params adv_params;
  memset(&adv_params, 0, sizeof(adv_params));
  adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
  adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;

  uint8_t own_addr_type;
  ble_hs_id_infer_auto(0, &own_addr_type);
  rc = ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER, &adv_params, sr_gap_event, NULL);
  if (rc != 0) ESP_LOGE(TAG, "adv_start rc=%d", rc);
}

static void sr_on_conn_done(uint16_t conn_handle, int status) {
  if (status == 0) {
    s_conn_handle = conn_handle;
    ESP_LOGI(TAG, "connected handle=%u", s_conn_handle);
  } else {
    sr_advertise();
  }
}

static int sr_gap_event(struct ble_gap_event *event, void *arg) {
  (void)arg;
  switch (event->type) {
  case BLE_GAP_EVENT_CONNECT:
    sr_on_conn_done(event->connect.conn_handle, event->connect.status);
    return 0;
  case BLE_GAP_EVENT_LINK_ESTAB:
    sr_on_conn_done(event->link_estab.conn_handle, event->link_estab.status);
    return 0;
  case BLE_GAP_EVENT_DISCONNECT:
    ESP_LOGI(TAG, "disconnect reason=%d", event->disconnect.reason);
    s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
    if (!s_teardown_silent) {
      sr_advertise();
    }
    return 0;
  case BLE_GAP_EVENT_MTU:
    s_att_mtu = event->mtu.value;
    ESP_LOGI(TAG, "mtu=%d", s_att_mtu);
    return 0;
  case BLE_GAP_EVENT_CONN_UPDATE:
    ESP_LOGI(TAG, "conn_update status=%d", event->conn_update.status);
    return 0;
  case BLE_GAP_EVENT_ADV_COMPLETE:
    sr_advertise();
    return 0;
  default:
    return 0;
  }
}

void sr_ble_relax_conn_for_wifi_coex(void) {
  if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE) return;
  /* itvl 单位为 1.25ms；拉大间隔减少 BLE 射频占用，便于 STA 完成 Auth/Assoc */
  struct ble_gap_upd_params u = {
      .itvl_min = 160,
      .itvl_max = 320,
      .latency = 0,
      .supervision_timeout = 500,
  };
  int rc = ble_gap_update_params(s_conn_handle, &u);
  if (rc != 0) ESP_LOGW(TAG, "relax_conn gap_update_params rc=%d", rc);
}

static int sr_gatt_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt,
                          void *arg) {
  (void)conn_handle;
  (void)attr_handle;
  (void)arg;

  if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
    if (ble_uuid_cmp(ctxt->chr->uuid, &sr_tx_uuid.u) == 0) {
      static const uint8_t z = 0;
      return os_mbuf_append(ctxt->om, &z, 1) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }
    return BLE_ATT_ERR_UNLIKELY;
  }

  if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
    if (ble_uuid_cmp(ctxt->chr->uuid, &sr_rx_uuid.u) == 0) {
      uint16_t om_len = OS_MBUF_PKTLEN(ctxt->om);
      if (om_len == 0 || !s_wr) return 0;
      uint8_t *tmp = (uint8_t *)malloc(om_len);
      if (!tmp) return BLE_ATT_ERR_INSUFFICIENT_RES;
      int rc = os_mbuf_copydata(ctxt->om, 0, om_len, tmp);
      if (rc != 0) {
        free(tmp);
        return BLE_ATT_ERR_UNLIKELY;
      }
      if (om_len > 0) s_wr(tmp, om_len);
      free(tmp);
      return 0;
    }
  }
  return BLE_ATT_ERR_UNLIKELY;
}

static void sr_gatt_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg) {
  (void)arg;
  (void)ctxt;
}

static void sr_on_reset(int reason) { ESP_LOGW(TAG, "reset reason=%d", reason); }

static void sr_on_sync(void) {
  int rc = ble_hs_util_ensure_addr(0);
  if (rc != 0) {
    ESP_LOGE(TAG, "ensure_addr rc=%d", rc);
    return;
  }
  sr_advertise();
}

static void sr_host_task(void *param) {
  (void)param;
  nimble_port_run();
  nimble_port_freertos_deinit();
}

void sr_ble_set_write_cb(sr_ble_write_fn_t fn) { s_wr = fn; }

esp_err_t sr_ble_init(const char *gap_name) {
  if (s_stack_inited) return ESP_OK;
  strncpy(s_gap_name, gap_name ? gap_name : "SR", sizeof(s_gap_name) - 1);
  s_gap_name[sizeof(s_gap_name) - 1] = '\0';

  esp_err_t err = nimble_port_init();
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "nimble_port_init %d", err);
    return err;
  }

  ble_hs_cfg.reset_cb = sr_on_reset;
  ble_hs_cfg.sync_cb = sr_on_sync;
  ble_hs_cfg.gatts_register_cb = sr_gatt_register_cb;
  ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
  ble_hs_cfg.sm_io_cap = BLE_SM_IO_CAP_NO_IO;

  ble_svc_gap_init();
  ble_svc_gatt_init();

  int rc = ble_gatts_count_cfg(s_gatt_svcs);
  if (rc != 0) return ESP_FAIL;
  rc = ble_gatts_add_svcs(s_gatt_svcs);
  if (rc != 0) return ESP_FAIL;

  rc = ble_svc_gap_device_name_set(s_gap_name);
  if (rc != 0) return ESP_FAIL;

  ble_store_config_init();
  nimble_port_freertos_init(sr_host_task);
  s_stack_inited = true;
  return ESP_OK;
}

void sr_ble_stop_advertising(void) { ble_gap_adv_stop(); }

void sr_ble_start_advertising(void) { sr_advertise(); }

bool sr_ble_stack_ready(void) { return s_stack_inited; }

void sr_ble_notify_json(const char *json) {
  if (!json || s_conn_handle == BLE_HS_CONN_HANDLE_NONE || s_tx_val_handle == 0) return;

  size_t len = strlen(json);
  int mtu_payload = (int)s_att_mtu - 3;
  if (mtu_payload < 8) mtu_payload = 20;
  size_t chunk_max = (size_t)mtu_payload - 2;
  uint8_t seq = 0;
  size_t off = 0;

  while (off < len) {
    size_t chunk = len - off;
    if (chunk > chunk_max) chunk = chunk_max;
    bool last = (off + chunk >= len);
    uint8_t buf[256];
    if (2 + chunk > sizeof(buf)) break;
    buf[0] = seq++;
    buf[1] = last ? 1 : 0;
    memcpy(buf + 2, json + off, chunk);

    struct os_mbuf *om = ble_hs_mbuf_from_flat(buf, (uint16_t)(2 + chunk));
    if (!om) break;
    int rc = ble_gatts_notify_custom(s_conn_handle, s_tx_val_handle, om);
    if (rc != 0) {
      ESP_LOGW(TAG, "notify_custom rc=%d", rc);
      break;
    }
    off += chunk;
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void sr_ble_deinit_after_provision(void) {
  if (!s_stack_inited) return;
  s_teardown_silent = true;
  ble_gap_adv_stop();
  if (s_conn_handle != BLE_HS_CONN_HANDLE_NONE) {
    ble_gap_terminate(s_conn_handle, BLE_ERR_REM_USER_CONN_TERM);
    vTaskDelay(pdMS_TO_TICKS(200));
    s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
  }
  nimble_port_stop();
  vTaskDelay(pdMS_TO_TICKS(50));
  if (nimble_port_deinit() != ESP_OK) {
    ESP_LOGW(TAG, "nimble_port_deinit failed");
  }
  s_stack_inited = false;
  s_tx_val_handle = 0;
  s_teardown_silent = false;
}
