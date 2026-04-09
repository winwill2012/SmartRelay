# SmartRelay 微信小程序

## 运行

1. 使用 **微信开发者工具** 打开目录 `miniprogram/`（或仓库根下该目录）。
2. **必须先启动后端**（默认 `http://127.0.0.1:8000`，与 `utils/config.js` 中 `DEFAULT_BASE` 一致）。
3. 「**详情 → 本地设置**」中勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**（否则会出现 **`request:fail`**，无法访问本地或测试域名）。
4. 若后端不在本机或端口不同，修改 `app.js` 里 `globalData.apiBase` 或 `utils/config.js` 的 `DEFAULT_BASE`，须以 **`/api/v1`** 结尾。
5. **真机调试 / 真机预览**（必读）：
   - **不能**使用 `http://127.0.0.1:8000`：真机上 `127.0.0.1` 指向**手机自己**，不是开发电脑。
   - 在 **`miniprogram/app.js`** 里把 `globalData.apiBase` 改为 **`http://<电脑IPv4>:8000/api/v1`**（`ipconfig` 查看 IPv4；手机与电脑 **同一 WiFi**）。
   - 后端启动：`uvicorn app.main:app --host 0.0.0.0 --port 8000`（必须监听 `0.0.0.0`，否则外网/局域网连不上）。
   - 若仍 `request:fail`，检查 **Windows 防火墙** 是否放行 **8000** 端口入站。
   - 正式上线须使用 **HTTPS** 域名，并在 [微信公众平台](https://mp.weixin.qq.com) 配置 **request 合法域名**。

## 模拟器假 code（日志里出现 `thecodetislalmocklong`）

若服务端日志里 **`js_code=thecodetislalmocklong`**，说明 **微信开发者工具模拟器** 返回的是**固定假 code**，不是真机 `wx.login` 结果，微信服务器会报 **40029 invalid code**，与 AppID/Secret 是否正确无关。

**处理方式（任选）**：

1. 使用工具栏 **「真机调试」**，用手机微信扫码，在真机上登录（推荐）。
2. 在 **「详情 → 本地设置」** 中检查是否开启 **Mock**、**自定义预处理** 等会替换 `wx.login` 结果的选项并关闭。
3. 安装 **小程序开发版/体验版** 到手机，在真机环境测试登录。

---

## 微信登录 `invalid code`

`wx.login` 得到的 `code` **只对应当前小程序 AppID**，且 **仅可使用一次**（重复请求会 `invalid code`）。

请逐项核对：

1. **`project.config.json` 的 `appid`** 与 **后端环境变量 `WECHAT_APP_ID`** 完全一致（同一小程序，不是公众号、不是开放平台别的应用）。
2. **`WECHAT_SECRET`** 须为该小程序在 [微信公众平台](https://mp.weixin.qq.com) → **开发管理 → 开发设置 → AppSecret** 中的值（若重置过 Secret，需同步更新 `.env`）。
3. **修改 `.env` 后必须重启后端**（`get_settings` 会缓存），否则仍用旧 Secret。
4. `.env` 里 `WECHAT_APP_ID` / `WECHAT_SECRET` **首尾不要有空格、引号**（已做 strip，仍建议检查）。
5. 若仍失败，在**后端日志**中搜 `WeChat jscode2session failed`，看 `errcode`（如 `40029`/`40163` 多与 code 或重复使用有关）。

若仍使用测试号 `touristappid` 开发，请将后端 **`WECHAT_APP_ID`、`WECHAT_SECRET` 留空**，走开发模式（用 code 派生 openid，不调微信接口）。

登录页已支持：首次 `invalid code` 时自动重新 `wx.login` 换新 code 再请求一次。

## API 对接

- 严格遵循仓库根目录《协议标准.md》**§5.1 小程序** HTTP 路径与字段；前端仅使用 HTTP，不直连 MQTT。
- 鉴权：`Authorization: Bearer <access_token>`，由 `POST /auth/wechat` 换发。
- 通用响应：`{ code, message, data }`，`code === 0` 为成功。

## 蓝牙配网

- 需**真机**（模拟器无 BLE）；协议见《协议标准》§7（Service `FFF0`，写 `FFF1`，通知 `FFF2`）。
- 固件广播名为 **`SR-` + MAC 后缀**，并在广播中包含 **FFF0** 服务；小程序按名称或广播 UUID 过滤。
- **Android**：系统要求**定位权限**才能扫描 BLE，已声明 `scope.userLocation`；若搜不到，请到系统设置中允许小程序「位置信息」。
- 单次扫描约 **12 秒**，结束会有 Toast 提示是否发现设备；无任何列表时请确认：设备已**配网模式**（灯快闪）、手机蓝牙开启、与设备距离足够近。
- 若固件 JSON 与示例不一致，请在 `utils/ble.js` / `pages/provision` 中与固件统一。

## Tab 图标

`assets/tab-*.png` 为 **81×81** 线稿图标，颜色与 `app.json` 中 `tabBar.color`（`#8a8f99`）/ `selectedColor`（`#2563eb`）及原型 `prototype-base.css` 中 `--mp-muted` / `--mp-primary` 一致。

若需重绘，可执行：

```bash
python miniprogram/scripts/generate_tab_icons.py
```

（需安装 Pillow：`pip install pillow`）
