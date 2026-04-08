# SmartRelay Python 服务端

依据仓库根目录《协议标准.md》实现的 FastAPI 后端：REST（§6）、MySQL（§4 + `command_records` §5.7）、MQTT 上下行（§5）、在线判定（10s，§5.6）、定时任务（§4.5，每设备最多 10 条）。

## 环境

- Python 3.11+
- MySQL 8.x（字符集 `utf8mb4`）
- MQTT Broker（如 EMQX），服务端使用 `resource.md` 中的账号连接；设备认证方式见协议 §8（README 选项 A/B 需与运维一致）。

## 快速开始

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env   # 编辑 .env 填入 MySQL/MQTT/微信占位
```

### 数据库迁移

在 `backend` 目录下设置环境变量后执行（与 `pydantic-settings` 字段一致，可用大写）：

```bash
set MYSQL_HOST=...
set MYSQL_PORT=3306
set MYSQL_USER=...
set MYSQL_PASSWORD=...
set MYSQL_DATABASE=SmartRelay
python scripts\run_migrations.py
```

成功后会创建表并写入/更新默认管理员：`admin` / `admin123`（密码为 bcrypt 哈希；可通过 `ADMIN_DEFAULT_PASSWORD` 覆盖明文再哈希）。

若远程 MySQL 用户无建表权限，脚本会退出码 `2`，并在 `migrations/001_init_local_manual.sql` 写入与 `001_init.sql` 相同内容供人工在可执行 DDL 的环境运行；管理员哈希需自行用 bcrypt 生成后 `INSERT`/`UPDATE`。

### 启动 API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

健康检查：`GET /health`。

Base URL 示例：`http://localhost:8000`。通用响应：`{ "code": 0, "message": "ok", "data": ... }`，错误码见协议 §9。

### 鉴权

- 小程序：`Authorization: Bearer <token>`（`POST /api/v1/auth/wechat` 获取）。
- 管理端：`POST /api/v1/admin/login` 获取 `Bearer`。

### 微信登录

需配置 `WECHAT_APPID`、`WECHAT_SECRET`（微信公众平台小程序后台）。未配置时 `/api/v1/auth/wechat` 返回 `code=50001`。

### MQTT 行为

- 订阅：`smartrelay/v1/+/up/#`（QoS1）。
- 下行：`smartrelay/v1/{device_sn}/down/cmd`（QoS1），载荷见协议 §5.3。
- 处理：`telemetry` / `ack` / `event` 更新 `last_seen_at`、在线与 `relay_state`；`ack` 同步 `command_records`。
- 后台任务约每 1.5s 将「超过 10s 无上行」的设备置为离线；约每 10s 将超 30s 未 ACK 的指令标为 `timeout`。

### 定时任务

`device_schedules.cron_expr` 为 **Spring 风格 6 段**：`秒 分 时 日 月 周`，与 APScheduler `CronTrigger` 一致。调度在进程内加载；变更定时接口后会触发重载（另有每分钟全量重载兜底）。

## 联调注意

1. 设备须先在 `devices` 表中存在且 `mqtt_password` 正确，小程序 `bind` 方可成功（协议 §6.1）。
2. `POST /api/v1/devices/{device_id}/command` 受理后返回 **HTTP 202**，body 仍为 `{ code, message, data }`，`data.cmd_id` 用于轮询结果（协议 §5.7）。
3. 下行前请确认设备在线（`online=1`），否则 HTTP 返回 `50301`（body 内 `code`）。
4. 生产环境务必更换 `JWT_SECRET` 与默认管理员密码。
