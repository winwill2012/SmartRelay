# SmartRelay 管理后台（Vue 3 + Vite + Tailwind CSS 4）

## 运行

先在本机启动后端（默认 `http://127.0.0.1:8000`），再启动管理端：

```bash
cd admin-web
npm install
npm run dev
```

浏览器访问终端输出的本地 URL（默认 `http://localhost:5173`）。

**说明**：开发环境默认通过 Vite 把请求代理到 `http://127.0.0.1:8000`（见 `vite.config.ts`），一般**无需**配置 `.env`。若需浏览器直连其它地址，可复制 `.env.example` 为 `.env` 并设置 `VITE_API_BASE`（须含 `/api/v1`）。

## 构建

```bash
npm run build
npm run preview
```

## API 对接

- 遵循《协议标准.md》**§5.3 管理后台**：`POST /admin/auth/login`、`GET /admin/dashboard/metrics`、用户/设备/固件等接口。
- 请求头：`Authorization: Bearer <admin_access_token>`（登录成功后写入 `localStorage`）。
- Base URL：未设置 **`VITE_API_BASE`** 时，开发环境使用同源 **`/api/v1`**（经 Vite 代理）；生产构建默认 `http://127.0.0.1:8000/api/v1`，部署时请用环境变量覆盖，且须含 **`/api/v1`**。

## 样式

- 全局布局与侧栏样式来自原型 `管理后台原型/css/admin-base.css`（已复制到 `src/assets/admin-base.css`）。
- 业务组件使用 Tailwind 工具类与上述 CSS 变量协同。
