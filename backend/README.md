# SmartRelay Python 后端

基于 FastAPI、SQLAlchemy 2（async + aiomysql）、asyncio-mqtt，实现《协议标准.md》v1 的 HTTP API（§5）与 MQTT 桥接。

## 环境要求

- Python 3.10+
- MySQL 8（已执行仓库根目录 `database/init.sql`）
- MQTT Broker（可远程，与 `resource.md` 一致）

## 配置

1. 复制 `.env.example` 为 `.env`，填写 MySQL、MQTT、JWT 等（勿提交真实密码）。
2. 默认管理员账号在**首次启动**时若不存在则创建：`admin` / `admin123`（密码经 bcrypt 写入 `admin_users`，不在 SQL 文件中存明文）。

## 安装与运行

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- 根路径前缀：`/api/v1`
- 健康检查：`GET /health`
- 固件静态访问：上传后的文件位于 `uploads/`，URL 形如 `{PUBLIC_BASE_URL}/static/firmware/{version}/...`

## MQTT

- **订阅**（QoS 1）：`sr/v1/device/+/report`、`ack`、`heartbeat`、`ota/progress`，更新 `devices.last_seen_at`。
- **发布**（QoS 1）：`sr/v1/device/{device_id}/cmd`，载荷与协议 §4.1 一致，`cmd_id` 为 UUID。

## 微信小程序登录

未配置 `WECHAT_APP_ID` / `WECHAT_SECRET` 时，`POST /auth/wechat` 使用开发模式（按 `code` 生成稳定 `openid`）。生产环境请配置微信开放平台参数。

## HTTP 端点一览（相对 `/api/v1`）

**小程序**：`POST /auth/wechat`，`GET /user/me`，`GET /devices`，`POST /devices/bind`，`DELETE /devices/{device_id}/bind`，`PATCH /devices/{device_id}`，`POST /devices/{device_id}/command`，`GET /devices/{device_id}/command/{cmd_id}`，`GET /devices/{device_id}/logs`，`GET/POST /devices/{device_id}/schedules`，`PATCH /schedules/{schedule_id}`，`DELETE /schedules/{schedule_id}`，`POST /devices/{device_id}/share`，`GET /shares`，`POST /devices/{device_id}/ota/check`，`GET /notifications`，`POST /device/claim`。

**管理后台**：`POST /admin/auth/login`，`POST /admin/auth/password`，`GET /admin/dashboard/metrics`，`GET /admin/users`，`GET /admin/users/{user_id}`，`GET /admin/devices`，`GET /admin/devices/{device_pk}`，`GET /admin/devices/{device_pk}/logs`，`POST /admin/firmware`，`PATCH /admin/firmware/{fw_id}`。

交互式文档：`/docs`（Swagger）。
