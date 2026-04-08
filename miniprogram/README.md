# SmartRelay 微信小程序

## 功能概览

- 底部 Tab：**设备**、**我的**
- 微信登录：`wx.login` → `POST /api/v1/auth/wechat`（body `{ code }`），Bearer 存储于本地
- 设备列表、详情页远程开关（`POST /api/v1/devices/{id}/command`，`{ on }`）、在线/离线展示（依赖服务端约 10s 规则）
- 蓝牙配网：GATT UUID 与 JSON 帧与《协议标准》第 7 节一致（`wifi_config` / `wifi_result`）
- 绑定：`POST /api/v1/devices/bind`
- 操作日志、定时任务 CRUD（每设备最多 10 条）、备注、解绑

## 工程说明

- 使用 **微信开发者工具** 打开本目录 `miniprogram/`（项目根目录即 `app.json` 所在目录）
- **AppID**：开发阶段可使用测试号或 `touristappid`；在 `project.config.json` 中修改
- **合法域名**：真机请求需在小程序后台配置 request 合法域名（HTTPS）；本地调试可在开发者工具中开启「不校验合法域名」

## API Base URL

- 默认：`http://127.0.0.1:8000`（见 `utils/config.js`），仅本机微信开发者工具 + 电脑后端可用。
- 可在 **我的** 页修改并保存（本地存储 `api_base_url`）。
- **真机/体验版**若出现 `url not in domain list`：必须使用 **HTTPS** 域名（不能用裸 IP），并在 [微信公众平台](https://mp.weixin.qq.com) → **开发管理 → 开发设置 → 服务器域名** 中把该域名填入 **request 合法域名**。开发者工具内可勾选 **不校验合法域名** 做本地联调。

## Mock 数据

- 各页 `USE_MOCK` 常量（如 `pages/devices/devices.js`）置为 `true` 时走 `utils/mock.js`，**联调通过后请改回 `false` 并删除 TODO**

## 启动步骤

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，目录选择 `SmartRelay/miniprogram`
3. 编译运行；若需真机蓝牙，使用真机预览并开启蓝牙与定位（Android）

## 蓝牙权限

- 首次扫描前会弹出说明弹窗；Android 扫描 BLE 常需**定位权限**，请引导用户在系统设置中授权
