const ble = require('../../utils/ble.js')
const wifi = require('../../utils/wifi.js')

const app = getApp()

Page({
  data: {
    step: 0,
    scanning: false,
    found: [],
    pickedId: '',
    pickedName: '',
    wifiSsid: '',
    wifiPwd: '',
    showPwd: false,
    provisioning: false,
    wifiLoading: false,
    wifiListRaw: [],
    wifiListEnriched: [],
    wifiPickerIndex: 0,
    manualSsid: false,
    showWifiSheet: false
  },

  stopSheetBubble() {},

  openWifiSheet() {
    if (!this.data.wifiListEnriched.length) {
      wx.showToast({ title: '暂无列表，请先刷新', icon: 'none' })
      return
    }
    this.setData({ showWifiSheet: true })
  },

  closeWifiSheet() {
    this.setData({ showWifiSheet: false })
  },

  selectWifiRow(e) {
    const idx = parseInt(e.currentTarget.dataset.index, 10)
    const row = this.data.wifiListRaw[idx]
    if (!row) return
    this.setData({
      wifiPickerIndex: idx,
      wifiSsid: row.SSID || '',
      showWifiSheet: false
    })
  },

  onUnload() {
    ble.stopScan().catch(() => {})
    wifi.stopWifi().catch(() => {})
  },

  togglePwd() {
    this.setData({ showPwd: !this.data.showPwd })
  },

  toggleManualSsid() {
    const manual = !this.data.manualSsid
    this.setData({ manualSsid: manual })
    if (!manual && this.data.wifiListRaw.length) {
      const idx = Math.min(this.data.wifiPickerIndex, this.data.wifiListRaw.length - 1)
      const row = this.data.wifiListRaw[idx]
      if (row && row.SSID) {
        this.setData({ wifiSsid: row.SSID })
      }
    }
  },

  onSsid(e) {
    this.setData({ wifiSsid: e.detail.value })
  },

  onPwd(e) {
    this.setData({ wifiPwd: e.detail.value })
  },

  async refreshWifiList() {
    if (this.data.wifiLoading) return
    this.setData({
      wifiLoading: true,
      wifiListRaw: [],
      wifiListEnriched: []
    })
    try {
      await ble.authorizeLocationIfNeeded()
      const list = await wifi.getNearbyWifiList()
      const enriched = list.map((w) => {
        const sig = w.signalStrength != null ? Number(w.signalStrength) : 0
        let sigLevel = 1
        if (sig >= 0.75) sigLevel = 4
        else if (sig >= 0.5) sigLevel = 3
        else if (sig >= 0.25) sigLevel = 2
        return Object.assign({}, w, { sigLevel })
      })
      let idx = 0
      let ssid = ''
      if (list.length) {
        const prev = this.data.wifiSsid
        const found = list.findIndex((w) => w.SSID === prev)
        idx = found >= 0 ? found : 0
        ssid = list[idx].SSID || ''
      }
      this.setData({
        wifiListRaw: list,
        wifiListEnriched: enriched,
        wifiPickerIndex: idx,
        wifiSsid: ssid || this.data.wifiSsid
      })
    } catch (e) {
      wx.showToast({ title: e.message || '获取 Wi-Fi 失败', icon: 'none' })
    } finally {
      this.setData({ wifiLoading: false })
    }
  },

  async onScan() {
    if (this.data.scanning) return
    this.setData({ scanning: true, found: [] })
    this._autoConnectDone = false
    let scanTimer = null
    try {
      await ble.authorizeLocationIfNeeded()
      await ble.openBluetooth()
      const seen = {}
      const acc = []
      scanTimer = setTimeout(() => {
        if (this._autoConnectDone) return
        ble.stopScan().then(() => {
          const n = acc.length
          wx.showToast({
            title: n ? `发现 ${n} 台设备` : '未发现设备：请确认设备已配网模式且靠近手机',
            icon: 'none',
            duration: 2800
          })
          this.setData({ scanning: false })
        })
      }, 12000)
      await ble.startScan((d) => {
        if (!d.deviceId || seen[d.deviceId]) return
        seen[d.deviceId] = true
        acc.push(d)
        this.setData({ found: acc.slice() })
        if (!this._autoConnectDone) {
          this._autoConnectDone = true
          if (scanTimer) clearTimeout(scanTimer)
          scanTimer = null
          ble
            .stopScan()
            .then(() => {
              this._connectAndGoStep1(
                d.deviceId,
                (d.name || d.localName || '').trim()
              )
            })
            .catch((e) => {
              wx.showToast({ title: e.message || '停止扫描失败', icon: 'none' })
              this.setData({ scanning: false })
            })
        }
      })
    } catch (e) {
      if (scanTimer) clearTimeout(scanTimer)
      wx.showToast({ title: e.message || '搜索失败', icon: 'none' })
      this.setData({ scanning: false })
    }
  },

  async _connectAndGoStep1(deviceId, name) {
    wx.showLoading({ title: '连接中…', mask: true })
    try {
      await ble.connect(deviceId)
      this.setData(
        {
          step: 1,
          pickedId: deviceId,
          pickedName: name,
          wifiListRaw: [],
          wifiListEnriched: [],
          wifiSsid: '',
          manualSsid: false
        },
        () => {
          this.refreshWifiList()
        }
      )
      wx.hideLoading()
      this.setData({ scanning: false })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '连接失败', icon: 'none' })
      this.setData({ scanning: false })
    }
  },

  async onPickDevice(e) {
    const id = e.currentTarget.dataset.id
    const name = (e.currentTarget.dataset.name || '').trim()
    try {
      await ble.stopScan()
    } catch (err) {}
    await this._connectAndGoStep1(id, name)
  },

  onCancelWifi() {
    if (this.data.pickedId) {
      ble.disconnect(this.data.pickedId).catch(() => {})
    }
    this.setData({ step: 0, provisioning: false })
  },

  async onStartProvision() {
    const { wifiSsid, wifiPwd, pickedId } = this.data
    if (!wifiSsid) {
      wx.showToast({ title: '请选择或输入 Wi-Fi 名称', icon: 'none' })
      return
    }
    this.setData({ provisioning: true })
    wx.showLoading({ title: '配网中…', mask: true })
    try {
      const info = await this._provisionOnce(pickedId, wifiSsid, wifiPwd)
      app.globalData.provisionResult = Object.assign({}, info, {
        bleDeviceId: pickedId
      })
      wx.hideLoading()
      this.setData({ provisioning: false })
      wx.navigateTo({
        url: `/pages/bind/bind?device_id=${encodeURIComponent(
          info.device_id || ''
        )}`
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ provisioning: false })
      wx.showToast({ title: e.message || '配网失败', icon: 'none' })
    }
  },

  _provisionOnce(deviceId, ssid, password) {
    return new Promise(async (resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('配网超时'))
      }, 180000)

      function finish(err, data) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve(data)
      }

      try {
        const serviceId = await ble.findService(deviceId)
        const { rx, tx } = await ble.resolveProvisionCharIds(deviceId, serviceId)
        await ble.setMtu(deviceId)
        await ble.delay(120)
        await ble.enableNotify(
          deviceId,
          serviceId,
          (msg) => {
            if (!msg || typeof msg !== 'object') return
            if (msg.type === 'wifi.result' && msg.ok === false) {
              const hint = msg.hint || ''
              const code =
                msg.wifi_status != null ? ` [WiFi状态${msg.wifi_status}]` : ''
              finish(
                new Error(
                  (hint || msg.error || 'WiFi 连接失败') + code
                )
              )
              return
            }
            /* 成功：固件在 wifi.result 中带 device_id（单条 JSON），避免依赖第二条 device.info 在共存场景丢失 */
            if (
              msg.device_id &&
              (msg.type === 'device.info' ||
                (msg.type === 'wifi.result' && msg.ok === true))
            ) {
              finish(null, {
                device_id: msg.device_id,
                mac: msg.mac,
                fw_version: msg.fw_version,
                device_secret: msg.device_secret
              })
            }
          },
          tx
        )
        await ble.writeJson(
          deviceId,
          serviceId,
          {
            type: 'wifi.set',
            ssid,
            password
          },
          rx
        )
      } catch (e) {
        finish(e, null)
      }
    })
  }
})
