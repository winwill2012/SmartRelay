/**
 * 蓝牙配网：与《协议标准》§7 UUID / JSON 帧格式对齐
 */
const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
const TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

function normalizeUuid(u) {
  return (u || '').toUpperCase()
}

/**
 * @param {{ ssid: string, password: string, token?: string }} cfg
 * @returns {string} JSON 字符串 UTF-8
 */
function buildWifiConfigFrame(cfg) {
  const payload = {
    type: 'wifi_config',
    ssid: cfg.ssid,
    password: cfg.password
  }
  if (cfg.token) payload.token = cfg.token
  return JSON.stringify(payload)
}

/**
 * 解析设备 TX 通知文本为 JSON（wifi_result 等）
 * @param {ArrayBuffer} value
 */
function parseNotifyJson(value) {
  if (!value) return null
  const u8 = new Uint8Array(value)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  try {
    return JSON.parse(s.trim())
  } catch (e) {
    return { _raw: s }
  }
}

module.exports = {
  SERVICE_UUID,
  RX_CHAR_UUID,
  TX_CHAR_UUID,
  normalizeUuid,
  buildWifiConfigFrame,
  parseNotifyJson
}
