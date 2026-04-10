# SmartRelay 固件（纯 ESP-IDF）

本目录为**纯 ESP-IDF**实现（`idf.py` 构建），**不依赖** Arduino / PlatformIO。协议行为与 `firmware/src/main.cpp`（历史 Arduino 版）及《协议标准.md》对齐：MQTT 上下行、BLE 配网 GATT、HTTPS OTA+MD5、定时任务、继电器/LED/BOOT 清网等。

## 环境（推荐）

- [ESP-IDF](https://docs.espressif.com/projects/esp-idf/) **v5.5.4**（LTS 线，内置 `json`、`mqtt`；HTTPS/证书 bundle 走 `mbedtls` + `sdkconfig` 中的 `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE`，代码里仍可用 `esp_crt_bundle.h`，**不必**在 `CMakeLists.txt` 里 `REQUIRES esp_crt_bundle`）
- 目标：**esp32c3**

```bash
cd firmware-idf
idf.py set-target esp32c3
idf.py build
idf.py -p COMx flash monitor
```

安装与 `IDF_PATH`、`export.ps1` 见乐鑫官方「Get Started」文档。

## 工程说明

| 模块 | 文件 | 说明 |
|------|------|------|
| 应用主循环 | `main/sr_app.cpp` | 配网队列、WiFi 自愈、MQTT、心跳、定时任务 |
| WiFi | `main/sr_wifi.cpp` | `esp_netif` / `esp_wifi`，扫描选 BSSID、modem sleep |
| MQTT | `main/sr_mqtt.cpp` | 内置 `mqtt` 组件，`esp_mqtt_client` |
| BLE | `main/sr_ble.c` | NimBLE GATT 0xFFF0/FFF1/FFF2，分帧 notify |
| JSON | 内置 `json`（cJSON） | cmd / report / schedule |
| OTA | `main/sr_ota.cpp` | `esp_http_client` + `esp_ota_ops`，**`esp_rom_md5`** 流式校验 |
| 配置 | `main/include/sr_config.h` | 与历史 `firmware/src/config.h` 可同步 |

历史 **PlatformIO** 工程在 `firmware/`；量产构建建议以本目录为准。

## sdkconfig / 分区

- 根目录 `partitions.csv`：单 `factory`，约 1.75MB 应用区（可按 Flash 调整）。
- OTA 支持 https（证书 bundle）与 http（`CONFIG_ESP_HTTPS_OTA_ALLOW_HTTP`，仅建议开发环境）。

## NimBLE GAP 事件名

若编译报错 `BLE_GAP_EVENT_LINK_ESTAB` 未定义，请对照当前 IDF 的 `ble_gap` 头文件改为连接事件（例如 `BLE_GAP_EVENT_CONNECT`）。

## 与 Arduino 版的差异说明

- **MQTT**：内置客户端 + 业务层退避重连。
- **时间**：SNTP 同步后再跑 schedule。
- **report（定时）**：可带 `report_reason`、`schedule_id`、`schedule_action`。

## 若将来升级到 ESP-IDF v6.x

升级到 v6 时：`json`、`mqtt` 多为托管组件（`idf_component.yml`）；证书 bundle 仅依赖 `mbedtls` 即可，勿再声明独立 `esp_crt_bundle` 组件。详见 v6 迁移指南。
