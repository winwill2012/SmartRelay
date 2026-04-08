# SmartRelay 管理后台（Vue 3）

## 功能

- 管理员登录 `POST /api/v1/admin/login`（默认账号 **admin** / **admin123**，与协议初始化一致）
- 修改密码 `POST /api/v1/admin/password`
- 数据大屏 `GET /api/v1/admin/dashboard`
- 用户列表 / 详情 `GET /api/v1/admin/users`、`GET /api/v1/admin/users/{user_id}`
- 设备列表 `GET /api/v1/admin/devices`，设备日志 `GET /api/v1/admin/devices/{device_id}/logs`

## 技术栈

- Vue 3、Vue Router、Pinia、Axios、Element Plus、Sass
- API 封装：`src/api/http.ts`，统一 `Authorization: Bearer <token>`，按响应体 `code` 判断（《协议标准》第 9 节）

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE` | 请求前缀，开发默认 `/api`，由 Vite 代理到后端 |

复制 `.env.development` 按需修改；生产构建使用 `.env.production`。

## 启动方式

```bash
cd admin-web
npm install
npm run dev
```

浏览器访问终端提示的本地地址（默认 `http://127.0.0.1:5173`）。

- **开发代理**：`vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:8000`，与协议 Base URL 示例一致。
- 若后端在不同端口，请改 `vite.config.ts` 的 `server.proxy['/api'].target`。

## 构建

```bash
npm run build
```

产物在 `dist/`，可部署到任意静态站点；将 `VITE_API_BASE` 设为线上 API 根路径（需同域反向代理或后端 CORS）。

