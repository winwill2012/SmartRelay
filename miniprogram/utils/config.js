/**
 * 后端 Base URL（不含尾部 /），与《协议标准》§6 一致。
 * - 开发者工具：可在「详情 → 本地设置」勾选「不校验合法域名、TLS 版本」；project.config.json 已设 urlCheck:false 便于模拟器。
 * - 真机/体验版：必须使用 HTTPS，且域名须加入公众平台「request 合法域名」；不可使用裸 IP、不可访问 127.0.0.1。
 */
const DEFAULT_BASE = 'http://127.0.0.1:8000'

function getBaseURL() {
  try {
    const saved = wx.getStorageSync('api_base_url')
    if (saved) return saved
  } catch (e) {}
  return DEFAULT_BASE
}

function setBaseURL(url) {
  wx.setStorageSync('api_base_url', url)
}

module.exports = {
  getBaseURL,
  setBaseURL,
  DEFAULT_BASE
}
