# SmartRelay 部署文档（教学版）

本文面向学员，目标是让你在新机器上从 0 到 1 部署 SmartRelay（后端 + 管理后台 + 小程序 + 固件）。

## 1. 项目结构与统一配置

统一配置模板在根目录 `config/`：

- `config/backend.env.example`：后端环境变量模板
- `config/admin-web.env.production.example`：管理后台生产环境模板
- `config/miniprogram.app.config.example.js`：小程序 API 配置模板
- `config/firmware.sdkconfig.runtime.example`：固件运行时配置模板
- `config/README.md`：配置总览

> 推荐做法：每个环境（dev/staging/prod）维护一份自己的配置文件，不要直接改模板文件。

## 2. 环境准备

### 2.1 基础环境

- Git
- Python 3.10+
- Node.js 18+（推荐 LTS）
- MySQL 8
- MQTT Broker（如 EMQX / Mosquitto）
- Nginx（用于生产反向代理）

### 2.2 可选环境

- 微信开发者工具（小程序）
- ESP-IDF v5.5.4（固件）

## 2.3 一键初始化脚本（Windows）

项目提供 PowerShell 脚本：

`scripts/bootstrap.ps1`

功能：

- 自动复制缺失配置文件（从 `config/` 模板）
- 安装后端 Python 依赖
- 安装管理后台 npm 依赖
- 可选执行数据库迁移与默认管理员初始化

执行（仓库根目录）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
```

常用参数：

- 跳过数据库：`-SkipDb`
- 跳过后端依赖：`-SkipBackendInstall`
- 跳过管理后台依赖：`-SkipAdminInstall`

如果要执行数据库迁移，请先设置：

```powershell
$env:SR_MYSQL_PASS="你的数据库密码"
```

## 3. 后端部署（FastAPI）

### 3.1 配置

1. 复制配置模板：

```bash
cp config/backend.env.example backend/.env
```

2. 修改 `backend/.env` 关键项：

- `PUBLIC_BASE_URL`：对外可访问地址（影响 OTA URL 生成）
- `MYSQL_*`：数据库连接
- `MQTT_*`：MQTT 连接
- `JWT_SECRET`：生产环境必须改成高强度随机值
- `WECHAT_APP_ID` / `WECHAT_SECRET`：接真实微信登录时填写

### 3.2 安装依赖并启动

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

健康检查：`GET /health`

## 4. 数据库初始化与迁移

### 4.1 配置数据库密码（必须用环境变量）

Windows PowerShell：

```powershell
$env:SR_MYSQL_PASS="你的数据库密码"
```

Linux/macOS：

```bash
export SR_MYSQL_PASS="你的数据库密码"
```

### 4.2 执行迁移

```bash
python database/apply.py
```

指定单个迁移：

```bash
python database/apply.py database/migrations/xxx.sql
```

### 4.3 初始化管理员（可选）

```bash
python database/seed_admin.py
```

默认管理员：`admin / admin123`（建议首次登录后立刻修改）。

## 5. 管理后台部署（Vue3 + Vite）

### 5.1 配置

复制模板并修改：

```bash
cp config/admin-web.env.production.example admin-web/.env.production
```

其中 `VITE_API_BASE` 必须以 `/api/v1` 结尾，例如：

`https://your-domain.com/smart-relay/api/v1`

### 5.2 本地开发

```bash
cd admin-web
npm install
npm run dev
```

### 5.3 生产构建

```bash
cd admin-web
npm run build
```

将 `admin-web/dist/` 部署到 Nginx 静态目录（或对象存储/CDN）。

## 6. 小程序配置与运行

### 6.1 配置

项目已统一改为 `miniprogram/config/app.config.js` 管理 API 地址。

首次可按模板覆盖：

```bash
# 手动复制内容：config/miniprogram.app.config.example.js -> miniprogram/config/app.config.js
```

修改 `apiBase`：

- 本地真机联调：`http://<电脑IPv4>:8000/api/v1`
- 线上：`https://your-domain.com/smart-relay/api/v1`

### 6.2 微信开发者工具

1. 打开 `miniprogram/`
2. 本地调试时可关闭合法域名校验
3. 真机调试务必避免使用 `127.0.0.1`

## 7. 固件配置与编译（ESP-IDF）

### 7.1 配置项统一入口

固件运行时配置已改为 `CONFIG_SR_*`：

- `CONFIG_SR_FW_VERSION`
- `CONFIG_SR_MQTT_HOST`
- `CONFIG_SR_MQTT_PORT`
- `CONFIG_SR_MQTT_USER`
- `CONFIG_SR_MQTT_PASS`

默认值位置：

- `firmware/sdkconfig.defaults`
- `firmware/main/Kconfig.projbuild`

模板参考：

- `config/firmware.sdkconfig.runtime.example`

### 7.2 编译烧录

```bash
cd firmware
idf.py set-target esp32c3
idf.py build
idf.py -p COMx flash monitor
```

如需改配置，可执行：

```bash
idf.py menuconfig
```

## 8. Nginx 反向代理建议

建议统一网关前缀：`/smart-relay/`

- API 反代到后端：`/smart-relay/api/ -> backend`
- 管理后台静态资源：`/smart-relay/admin/ -> admin-web/dist`

可参考仓库中的 `deploy/` 配置文件进行适配。

## 9. 生产上线核对清单

- [ ] 后端 `backend/.env` 已替换默认密码与密钥
- [ ] MySQL 迁移已执行，管理员已创建
- [ ] 管理后台 `VITE_API_BASE` 指向正确线上 API
- [ ] 小程序 `apiBase` 指向正确环境
- [ ] 固件 `CONFIG_SR_MQTT_*` 与服务端一致
- [ ] Nginx 路由前缀与静态目录配置正确
- [ ] `GET /health` 正常

## 10. 常见问题

1. **小程序真机请求失败**
   - 通常是 `apiBase` 仍为 `127.0.0.1` 或域名白名单未配置。

2. **设备在线但指令无响应**
   - 先核对固件 MQTT 参数与后端/Broker 是否一致。
   - 检查后端是否成功发布到 `sr/v1/device/{device_id}/cmd`。

3. **OTA 链接下载失败**
   - 核对 `PUBLIC_BASE_URL` 是否可被设备访问。

---

如果你要做教学演示，建议再额外准备三份文件：

- `backend/.env.dev`（本地）
- `backend/.env.staging`（演示）
- `backend/.env.prod`（线上）

课堂上只讲“复制到 `backend/.env` 并启动”，学员会更容易理解。
