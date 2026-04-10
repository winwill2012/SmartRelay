/**
 * BLE 配网（协议 §7）：Service FFF0，写 FFF1，通知 FFF2
 * 消息：wifi.set / wifi.result / device.info 等，JSON UTF-8
 */

const SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB'
const CHAR_RX_UUID = '0000FFF1-0000-1000-8000-00805F9B34FB'
const CHAR_TX_UUID = '0000FFF2-0000-1000-8000-00805F9B34FB'

const NAME_PREFIX = 'SR-'

/** 固件广播名形如 SR-A1B2，并在广播中带 FFF0 服务 UUID */
function _uuidLooksLikeFff0(u) {
  if (!u) return false
  const s = String(u).toUpperCase().replace(/-/g, '')
  return s.indexOf('FFF0') >= 0
}

function isSmartRelayAdvert(d) {
  const name = (d.name || d.localName || '').trim()
  if (/^SR-/i.test(name)) return true
  const uuids = d.advertisServiceUUIDs || []
  if (uuids.some(_uuidLooksLikeFff0)) return true
  return false
}

function openBluetooth() {
  return new Promise((resolve, reject) => {
    wx.openBluetoothAdapter({
      success: resolve,
      fail: (e) => {
        const msg = e.errMsg || ''
        if (/already|已打开|已开启/i.test(msg)) {
          resolve()
          return
        }
        reject(new Error(msg || '请打开手机蓝牙'))
      }
    })
  })
}

/** Android 6+ 扫描 BLE 常需定位权限（系统策略），否则可能搜不到设备 */
function authorizeLocationIfNeeded() {
  return new Promise((resolve) => {
    try {
      const sys = wx.getSystemInfoSync()
      if (sys.platform !== 'android') {
        resolve()
        return
      }
      wx.authorize({
        scope: 'scope.userLocation',
        complete: () => resolve()
      })
    } catch (e) {
      resolve()
    }
  })
}

function closeBluetooth() {
  return new Promise((resolve) => {
    wx.closeBluetoothAdapter({ complete: resolve })
  })
}

function startScan(onFound) {
  try {
    if (typeof wx.offBluetoothDeviceFound === 'function') {
      wx.offBluetoothDeviceFound()
    }
  } catch (e) {}

  const handler = (res) => {
    const list = res.devices || []
    list.forEach((d) => {
      if (!d.deviceId) return
      if (isSmartRelayAdvert(d)) {
        onFound(d)
      }
    })
  }

  wx.onBluetoothDeviceFound(handler)

  return new Promise((resolve, reject) => {
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true,
      success: resolve,
      fail: (e) => reject(new Error(e.errMsg || '搜索失败'))
    })
  })
}

function stopScan() {
  return new Promise((resolve) => {
    try {
      if (typeof wx.offBluetoothDeviceFound === 'function') {
        wx.offBluetoothDeviceFound()
      }
    } catch (e) {}
    wx.stopBluetoothDevicesDiscovery({ complete: resolve })
  })
}

function connect(deviceId) {
  return new Promise((resolve, reject) => {
    wx.createBLEConnection({
      deviceId,
      timeout: 15000,
      success: resolve,
      fail: (e) => {
        const msg = e.errMsg || ''
        /* 已存在连接时再次 create 会 fail:already，按成功处理以便配网继续 */
        if (/already|已连接/i.test(msg)) {
          resolve()
          return
        }
        reject(new Error(msg || '连接失败'))
      }
    })
  })
}

/**
 * 协商 MTU（默认 23 时单次写约 20 字节，wifi.set JSON 会截断导致固件无法解析）
 * iOS/Android 行为不同，失败时仍继续尝试写入。
 */
function setMtu(deviceId, mtu) {
  const m = mtu != null ? mtu : 247
  return new Promise((resolve) => {
    if (typeof wx.setBLEMTU !== 'function') {
      resolve(null)
      return
    }
    wx.setBLEMTU({
      deviceId,
      mtu: m,
      success: (r) => resolve((r && r.mtu) || m),
      fail: () => resolve(null)
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 使用设备返回的特征 UUID（部分机型对大小写/短 UUID 敏感）
 */
function resolveProvisionCharIds(deviceId, serviceId) {
  return getCharacteristics(deviceId, serviceId)
    .then((chars) => {
      const norm = (u) => (u || '').toUpperCase().replace(/-/g, '')
      const rx = chars.find((c) => norm(c.uuid).indexOf('FFF1') >= 0)
      const tx = chars.find((c) => norm(c.uuid).indexOf('FFF2') >= 0)
      return {
        rx: (rx && rx.uuid) || CHAR_RX_UUID,
        tx: (tx && tx.uuid) || CHAR_TX_UUID
      }
    })
    .catch(() => ({ rx: CHAR_RX_UUID, tx: CHAR_TX_UUID }))
}

function disconnect(deviceId) {
  return new Promise((resolve) => {
    wx.closeBLEConnection({ deviceId, complete: resolve })
  })
}

function getCharacteristics(deviceId, serviceId) {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (r) => resolve(r.characteristics || []),
      fail: (e) => reject(new Error(e.errMsg || '获取特征失败'))
    })
  })
}

function findService(deviceId) {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceServices({
      deviceId,
      success: async (r) => {
        const services = r.services || []
        const target = services.find((s) => {
          const u = (s.uuid || '').toUpperCase().replace(/-/g, '')
          return u.indexOf('FFF0') >= 0 || u === SERVICE_UUID.replace(/-/g, '')
        })
        if (!target) {
          reject(new Error('未找到配网服务'))
          return
        }
        resolve(target.uuid)
      },
      fail: (e) => reject(new Error(e.errMsg || '获取服务失败'))
    })
  })
}

function utf8Buf(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).buffer
  }
  const buf = new ArrayBuffer(str.length)
  const v = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) v[i] = str.charCodeAt(i) & 0xff
  return buf
}

function abToUtf8(ab) {
  const u8 = new Uint8Array(ab)
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(u8)
  }
  // 微信低版本无 TextDecoder 时，手动按 UTF-8 解码，避免中文提示乱码
  let out = ''
  let i = 0
  while (i < u8.length) {
    const c = u8[i++]
    if (c < 0x80) {
      out += String.fromCharCode(c)
      continue
    }
    if ((c & 0xe0) === 0xc0) {
      const c2 = u8[i++] & 0x3f
      out += String.fromCharCode(((c & 0x1f) << 6) | c2)
      continue
    }
    if ((c & 0xf0) === 0xe0) {
      const c2 = u8[i++] & 0x3f
      const c3 = u8[i++] & 0x3f
      out += String.fromCharCode(((c & 0x0f) << 12) | (c2 << 6) | c3)
      continue
    }
    const c2 = u8[i++] & 0x3f
    const c3 = u8[i++] & 0x3f
    const c4 = u8[i++] & 0x3f
    let cp = ((c & 0x07) << 18) | (c2 << 12) | (c3 << 6) | c4
    cp -= 0x10000
    out += String.fromCharCode(0xd800 + (cp >> 10))
    out += String.fromCharCode(0xdc00 + (cp & 0x3ff))
  }
  return out
}

function writeJson(deviceId, serviceId, jsonObj, characteristicId) {
  const str = JSON.stringify(jsonObj)
  const cid = characteristicId || CHAR_RX_UUID
  return new Promise((resolve, reject) => {
    wx.writeBLECharacteristicValue({
      deviceId,
      serviceId,
      characteristicId: cid,
      value: utf8Buf(str),
      success: resolve,
      fail: (e) => reject(new Error(e.errMsg || '写入失败'))
    })
  })
}

function mergeFrameChunks(chunks) {
  let n = 0
  chunks.forEach((c) => {
    n += c.length
  })
  const merged = new Uint8Array(n)
  let o = 0
  chunks.forEach((c) => {
    merged.set(c, o)
    o += c.length
  })
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(merged)
  }
  return abToUtf8(merged.buffer)
}

function isTruthyOk(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/**
 * 固件 §7：通知侧为分帧 [seq][last][payload…]，与裸 JSON 两种。
 * 裸 JSON 首字节为 `{` (0x7b)；分帧首字节为序号 0,1,2…
 */
function enableNotify(deviceId, serviceId, onMessage, characteristicId) {
  const txId = characteristicId || CHAR_TX_UUID
  let buffer = ''
  let frameChunks = []
  const normalizedTxId = String(txId || '')
    .toUpperCase()
    .replace(/-/g, '')

  function emitJson(text) {
    const t = (text || '').trim()
    if (!t) return
    try {
      onMessage(JSON.parse(t))
    } catch (err) {
      /* 裸 JSON 可能跨包按行拼 */
    }
  }

  function handleUnframedChunk(ab) {
    buffer += abToUtf8(ab)
    const tryParse = (s) => {
      const x = s.trim()
      if (!x) return
      try {
        onMessage(JSON.parse(x))
        buffer = ''
      } catch (err) {
        /* 未完 */
      }
    }
    tryParse(buffer)
    const nl = buffer.indexOf('\n')
    if (nl >= 0) {
      const parts = buffer.split('\n')
      buffer = parts.pop() || ''
      parts.forEach((line) => tryParse(line))
    }
  }

  const handler = (res) => {
    if (res.deviceId !== deviceId) return
    const cidNorm = String(res.characteristicId || '')
      .toUpperCase()
      .replace(/-/g, '')
    if (normalizedTxId && cidNorm !== normalizedTxId) {
      if (!(normalizedTxId.indexOf('FFF2') >= 0 && cidNorm.indexOf('FFF2') >= 0)) {
        return
      }
    }
    try {
      const u8 = new Uint8Array(res.value)
      if (!u8.length) return

      const looksLikeFramedHeader =
        u8.length >= 3 &&
        (u8[1] === 0 || u8[1] === 1) &&
        u8[0] < 64

      if (u8[0] === 0x7b || buffer || !looksLikeFramedHeader) {
        frameChunks = []
        handleUnframedChunk(res.value)
        return
      }

      const last = u8[1] !== 0
      frameChunks.push(u8.slice(2))
      if (last) {
        const text = mergeFrameChunks(frameChunks)
        frameChunks = []
        emitJson(text)
      }
    } catch (e) {
      onMessage({ parseError: true })
    }
  }

  try {
    if (typeof wx.offBLECharacteristicValueChange === 'function') {
      wx.offBLECharacteristicValueChange()
    }
  } catch (e) {}

  wx.onBLECharacteristicValueChange(handler)

  return new Promise((resolve, reject) => {
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId,
      characteristicId: txId,
      state: true,
      success: resolve,
      fail: (e) => reject(new Error(e.errMsg || '订阅通知失败'))
    })
  })
}

function disableNotify(deviceId, serviceId, characteristicId) {
  const txId = characteristicId || CHAR_TX_UUID
  return new Promise((resolve) => {
    try {
      if (typeof wx.offBLECharacteristicValueChange === 'function') {
        wx.offBLECharacteristicValueChange()
      }
    } catch (e) {}
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId,
      characteristicId: txId,
      state: false,
      complete: resolve
    })
  })
}

/**
 * 发送 WiFi 凭证并等待 device.info 或 wifi.result
 */
function provisionWifi(deviceId, ssid, password, timeoutMs = 180000) {
  let serviceId = null
  let txId = CHAR_TX_UUID
  return new Promise(async (resolve, reject) => {
    let settled = false
    let timer = null

    const finish = (err, data) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      /* 先收口 UI，清理动作后台执行，避免被平台回调卡住导致一直 loading */
      if (serviceId) {
        disableNotify(deviceId, serviceId, txId).catch(() => {})
      }
      if (err) reject(err)
      else resolve(data)
    }
    timer = setTimeout(() => {
      finish(new Error('配网超时'))
    }, timeoutMs)

    try {
      serviceId = await findService(deviceId)
      const { rx, tx } = await resolveProvisionCharIds(deviceId, serviceId)
      txId = tx || CHAR_TX_UUID
      await setMtu(deviceId)
      await delay(80)
      await enableNotify(
        deviceId,
        serviceId,
        (msg) => {
          if (!msg || typeof msg !== 'object') return
          if (msg.type === 'wifi.result') {
            if (!isTruthyOk(msg.ok)) {
              const t =
                (msg.hint || msg.error || 'WiFi 连接失败') +
                (msg.wifi_status != null ? ` [WiFi状态${msg.wifi_status}]` : '')
              finish(new Error(t))
              return
            }
            /* 固件成功时应带 device_id；若缺省仍结束 loading，避免一直「配网中」 */
            finish(null, msg)
            return
          }
          if (msg.type === 'device.info' && msg.device_id) {
            finish(null, msg)
          }
        },
        txId
      )
      await delay(60)
      await writeJson(deviceId, serviceId, { type: 'wifi.set', ssid, password }, rx)
    } catch (e) {
      finish(e)
    }
  })
}

module.exports = {
  NAME_PREFIX,
  SERVICE_UUID,
  CHAR_RX_UUID,
  CHAR_TX_UUID,
  openBluetooth,
  authorizeLocationIfNeeded,
  closeBluetooth,
  startScan,
  stopScan,
  connect,
  disconnect,
  findService,
  resolveProvisionCharIds,
  setMtu,
  delay,
  writeJson,
  enableNotify,
  disableNotify,
  provisionWifi
}
