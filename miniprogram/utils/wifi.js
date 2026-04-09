/**
 * 周边 Wi-Fi 列表（微信 wx.getWifiList）
 * 需定位权限；系统无法可靠区分 2.4G/5G，列表中过滤名称带 **5G 后缀** 的（常见双频 5G）。
 */

/** 名称以 -5G / _5G / 空格5G / 末尾 5G 等结尾时视为 likely 5GHz */
function isLikely5GHzSuffixSSID(ssid) {
  if (!ssid || typeof ssid !== 'string') return false
  const s = ssid.trim()
  return /(?:[_\s-])?5g$/i.test(s)
}

function filterWifiListForProvision(list) {
  return (list || []).filter((w) => !isLikely5GHzSuffixSSID(w.SSID))
}

function mergeBySsidOrBssid(existing, incoming) {
  const map = {}
  ;(existing || []).forEach((w) => {
    const k = w.BSSID || w.SSID || ''
    if (k) map[k] = w
  })
  ;(incoming || []).forEach((w) => {
    const k = w.BSSID || w.SSID || ''
    if (!k) return
    const prev = map[k]
    if (!prev || (w.signalStrength || 0) > (prev.signalStrength || 0)) {
      map[k] = w
    }
  })
  return Object.values(map)
}

/**
 * 启动 Wi-Fi 模块并拉取周边列表（会合并多次 onGetWifiList 回调，约 2.5s）
 */
function getNearbyWifiList() {
  return new Promise((resolve, reject) => {
    wx.startWifi({
      success: () => {
        let merged = []
        let settled = false
        let timer = null

        function listener(res) {
          merged = mergeBySsidOrBssid(merged, res.wifiList || [])
        }

        const done = () => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          try {
            if (typeof wx.offGetWifiList === 'function') {
              wx.offGetWifiList(listener)
            }
          } catch (e) {}
          const list = filterWifiListForProvision(
            merged.slice().sort((a, b) => (b.signalStrength || 0) - (a.signalStrength || 0))
          )
          resolve(list)
        }

        wx.onGetWifiList(listener)
        wx.getWifiList({
          fail: (e) => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            try {
              if (typeof wx.offGetWifiList === 'function') {
                wx.offGetWifiList(listener)
              }
            } catch (err) {}
            reject(new Error(e.errMsg || 'getWifiList 失败'))
          }
        })
        timer = setTimeout(done, 2500)
      },
      fail: (e) => reject(new Error(e.errMsg || 'startWifi 失败'))
    })
  })
}

function stopWifi() {
  return new Promise((resolve) => {
    if (typeof wx.stopWifi === 'function') {
      wx.stopWifi({ complete: resolve })
    } else {
      resolve()
    }
  })
}

module.exports = {
  getNearbyWifiList,
  stopWifi,
  isLikely5GHzSuffixSSID,
  filterWifiListForProvision
}
