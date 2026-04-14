# SmartRelay 配置总览

本目录用于**统一管理可配置项**。部署新环境时，优先从这里复制模板。

## 配置清单

- 后端：`backend/.env`（模板：`backend/.env.example` 或 `config/backend.env.example`）
- 管理后台：`admin-web/.env.production`（模板：`config/admin-web.env.production.example`）
- 小程序：`miniprogram/config/app.config.js`（模板：`config/miniprogram.app.config.example.js`）
- 固件（ESP-IDF）：`firmware/sdkconfig.defaults` / `menuconfig`
  - 模板：`config/firmware.sdkconfig.runtime.example`

## 推荐流程

1. 复制模板到对应模块。
2. 只改业务相关值（域名、数据库、MQTT、版本号）。
3. 严禁把真实密码/密钥提交到 Git。

## 关键约定

- 后端 `PUBLIC_BASE_URL` 必须是可被设备访问的公网地址（用于 OTA URL 拼装）。
- 小程序 `apiBase` 必须以 `/api/v1` 结尾。
- 固件 MQTT 配置通过 `CONFIG_SR_*` 管理，不再建议直接改代码常量。
