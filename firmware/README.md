# SmartRelay 固件（ESP32-C3）

基于 **PlatformIO** 的 ESP32-C3 工程，通信契约以仓库根目录《协议标准.md》v1.0 为准，勿臆造 Topic。

## 目录结构

```
firmware/
├── platformio.ini      # 工程与依赖
├── secrets.ini.example # 可选：本地复制为 secrets.ini 覆盖编译宏（勿提交）
├── .gitignore
├── README.md
└── src/
    ├── config.h        # 引脚、MQTT 默认参数（本地修改密码）
    └── main.cpp        # WiFi/NVS、BLE 配网、MQTT、继电器与 LED 状态机
```

## 硬件约定（与《项目需求文档》一致）

| 功能       | GPIO | 说明 |
|------------|------|------|
| 板载 LED   | 8    | 配网：快闪；MQTT 已连接：PWM 呼吸 |
| 继电器     | 4    | **低电平吸合**（ON = LOW） |
| BOOT 长按  | 9    | 默认 **5s** 清除 WiFi（及可选 MQTT 独立凭据）并重启进入配网 |

若你的开发板 BOOT 不是 GPIO9，请修改 `src/config.h` 中的 `PIN_BOOT`。

## `device_sn` 与 ClientId

- `device_sn`：由 `esp_read_mac(ESP_MAC_WIFI_STA)` 得到 6 字节 MAC，格式化为 **12 位大写十六进制**（与协议 §3 一致）。
- 上电后日志：`[SN] device_sn=XXXXXXXXXXXX clientId=SR_XXXXXXXXXXXX`（标签为 `SmartRelay`，可用 `pio device monitor` 查看）。
- MQTT **ClientId**：`SR_{device_sn}`（协议 §3）。

## MQTT 与认证（协议 §8）

- **默认实现（选项 B，PoC/共用 Broker 用户）**：连接用户名、密码使用 `src/config.h` 中的 `CFG_MQTT_USER` / `CFG_MQTT_PASS`，与 `resource.md` 中 Broker 账号一致。**烧录前必须在本地将 `CFG_MQTT_PASS` 改为你的密码，且勿将真实密码提交公开仓库。**
- **选项 A（推荐量产）**：在 NVS 命名空间 `sr` 中写入 `mqtt_user`（一般为 `device_sn`）、`mqtt_pass`（服务端 `devices.mqtt_password`）。若两者均非空，固件优先用其连接 Broker，而不再使用 `config.h` 中的默认口令。可通过自定义烧录脚本或后续工具写入，本仓库不包含 PC 侧写入工具。

## BLE 配网（协议 §7）

- **服务 UUID**：`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- **RX（写）**：`6E400002-B5A3-F393-E0A9-E50E24DCCA9E`
- **TX（Notify）**：`6E400003-B5A3-F393-E0A9-E50E24DCCA9E`
- 广播名：`SR-{device_sn 后 4 位}`（协议 §7.1）
- 手机下发 JSON（UTF-8）示例：

```json
{"type":"wifi_config","ssid":"YourAP","password":"secret","token":"optional"}
```

- 设备应答：

```json
{"type":"wifi_result","ok":true,"ip":"192.168.1.100"}
```

成功后设备会关闭 BLE、连接 MQTT，并按协议发布 `telemetry` / 处理 `down/cmd`。

## 编译与烧录

1. 安装 [PlatformIO](https://platformio.org/)（或 VS Code 插件）。
2. 编辑 `src/config.h`，设置 `CFG_MQTT_PASS`（及必要时 Host/Port）。
3. 在项目目录执行：

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

（Windows 下路径为 `g:\SmartRelay\firmware`。）

## 行为摘要

- NVS 中无有效 WiFi SSID：进入 **BLE 配网**，IO8 **快闪**。
- 已配网：连上 MQTT 且订阅成功后 IO8 **呼吸灯**；约每 **5s** 上报 `telemetry`（协议 §5.5）。
- 订阅 `smartrelay/v1/{device_sn}/down/cmd` **QoS1**；上行 ACK / telemetry 按协议 §5；**相同 `cmd_id` 不重复动作**，重复投递仅重发相同 ACK（协议 §5.3）。
- 配置 MQTT **Will**：主题 `smartrelay/v1/{device_sn}/up/event`，载荷 `{"type":"offline"}`（协议 §5.6 可选增强）。

## 与协议实现差异（假设说明）

1. **MQTT 认证**：默认按 §8 **选项 B** 使用共用 Broker 账号；选项 A 依赖 NVS 预置 `mqtt_user`/`mqtt_pass`，不由 BLE `wifi_config` 传输（§7 载荷仅含 `ssid`/`password`/`token`）。
2. **`telemetry` QoS**：协议允许 0 或 1；固件使用 **QoS1** 以利于弱网场景，服务端仍可按 §5.6 以最后上行时间判定在线。
3. **USB 串口**：未启用 `ARDUINO_USB_CDC_ON_BOOT`，避免部分 C3 核心与 `Serial` 定义冲突；日志通过 **ESP_LOG** 输出，请用串口监视器查看（波特率 115200）。
