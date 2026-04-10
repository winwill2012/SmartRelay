/**
 * 正式版可从 wx.getAccountInfoSync().miniProgram.version 读取；
 * 开发者工具/体验版常为空，使用 DEFAULT_VERSION 兜底。
 */
const DEFAULT_VERSION = '1.0.0'

function getMiniProgramVersion() {
  try {
    const info = wx.getAccountInfoSync()
    const v = info && info.miniProgram && info.miniProgram.version
    if (v && String(v).trim()) return String(v).trim()
  } catch (e) {}
  return ''
}

module.exports = {
  DEFAULT_VERSION,
  getMiniProgramVersion
}
