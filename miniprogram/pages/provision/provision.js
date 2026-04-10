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
    showWifiSheet: false
  },

  onShow() {
    this._alive = true
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
    this._alive = false
    this._provReqId = (this._provReqId || 0) + 1
    ble.stopScan().catch(() => {})
    wifi.stopWifi().catch(() => {})
  },

  onHide() {
    this._alive = false
  },

  togglePwd() {
    this.setData({ showPwd: !this.data.showPwd })
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
      const list = (await wifi.getNearbyWifiList()).filter((w) =>
        String(w.SSID || '')
          .trim()
      )
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
            title: n
              ? `发现 ${n} 台设备`
              : '未发现 SR- 设备：请先长按 BOOT 5s 清 WiFi，LED 快闪后重试，并打开手机蓝牙与定位',
            icon: 'none',
            duration: 3200
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
          wifiSsid: ''
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
    wx.hideLoading()
    this.setData({ step: 0, provisioning: false })
  },

  async onStartProvision() {
    if (this.data.provisioning) return
    const { wifiSsid, wifiPwd, pickedId } = this.data
    if (!wifiSsid) {
      wx.showToast({ title: '请选择或输入 Wi-Fi 名称', icon: 'none' })
      return
    }
    if (!pickedId) {
      wx.showToast({ title: '设备未连接，请返回重试', icon: 'none' })
      return
    }
    const reqId = (this._provReqId || 0) + 1
    this._provReqId = reqId
    this.setData({ provisioning: true })
    wx.showLoading({ title: '配网中…', mask: true })
    try {
      const info = await this._provisionStable(pickedId, wifiSsid, wifiPwd)
      if (!this._alive || this._provReqId !== reqId) return
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
      if (!this._alive || this._provReqId !== reqId) return
      wx.hideLoading()
      this.setData({ provisioning: false })
      wx.showToast({ title: e.message || '配网失败', icon: 'none' })
    }
  },

  async _provisionStable(deviceId, ssid, password) {
    const tryOnce = () => ble.provisionWifi(deviceId, ssid, password, 160000)
    try {
      return await tryOnce()
    } catch (e) {
      const msg = String((e && e.message) || '')
      const retryable =
        /超时|timeout|断开|not connected|10006|10008|10003/i.test(msg)
      if (!retryable) throw e
      await ble.disconnect(deviceId).catch(() => {})
      await ble.delay(300)
      await ble.connect(deviceId)
      return await tryOnce()
    }
  }
})
