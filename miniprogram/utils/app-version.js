/**
 * 正式版可从 wx.getAccountInfoSync().miniProgram.version 读取；
 * 开发者工具/体验版常为空，使用 DEFAULT_VERSION 兜底。
 * 注意：此为「小程序」版本展示用，与设备固件 FW_VERSION（见 firmware/main/include/sr_config.h）无关。
 */
const DEFAULT_VERSION = '1.0.6'

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
