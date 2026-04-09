/**
 * 后端 API Base（须以 /api/v1 结尾，与《协议标准.md》一致）
 *
 * - 仅模拟器：可用 http://127.0.0.1:8000/api/v1
 * - 真机调试：必须用电脑局域网 IP，勿用 127.0.0.1（真机上会指向手机自己）
 *   例：http://192.168.1.5:8000/api/v1，并在 app.js 的 globalData.apiBase 中覆盖
 */
const DEFAULT_BASE = 'http://127.0.0.1:8000/api/v1'

function getApiBase() {
  try {
    const app = getApp()
    if (app && app.globalData && app.globalData.apiBase) {
      return String(app.globalData.apiBase).replace(/\/$/, '')
    }
  } catch (e) {}
  return DEFAULT_BASE
}

function isLocalhostApiBase() {
  return /127\.0\.0\.1|localhost/i.test(getApiBase())
}

module.exports = {
  DEFAULT_BASE,
  getApiBase,
  isLocalhostApiBase
}
