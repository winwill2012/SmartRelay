const ble = require('../../utils/ble.js')

const str2ab = (str) => {
  const buf = new ArrayBuffer(str.length)
  const u8 = new Uint8Array(buf)
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i)
  return buf
}

Page({
  data: {
    ssid: '',
    wifiPwd: '',
    token: '',
    scanning: false,
    devices: [],
    statusText: '等待操作',
    selectedId: ''
  },
  onUnload() {
    this.teardownBle()
  },
  teardownBle() {
    try {
      wx.stopBluetoothDevicesDiscovery()
      wx.offBluetoothDeviceFound()
      wx.offBLECharacteristicValueChange()
    } catch (e) {}
  },
  onSsid(e) {
    this.setData({ ssid: e.detail.value })
  },
  onWifiPwd(e) {
    this.setData({ wifiPwd: e.detail.value })
  },
  onToken(e) {
    this.setData({ token: e.detail.value })
  },
  async onStartBle() {
    const { ssid, wifiPwd } = this.data
    if (!ssid || !wifiPwd) {
      wx.showToast({ title: '请填写 WiFi 与密码', icon: 'none' })
      return
    }
    const agreed = await new Promise((resolve) => {
      wx.showModal({
        title: '蓝牙权限说明',
        content:
          '将使用蓝牙连接您的硬件设备以传输 WiFi 信息；不会用于其他用途。部分系统需开启定位权限才能扫描蓝牙。',
        confirmText: '继续',
        success: (r) => resolve(!!r.confirm)
      })
    })
    if (!agreed) return

    this.setData({ scanning: true, devices: [], statusText: '正在打开蓝牙...' })
    try {
      await new Promise((resolve, reject) => {
        wx.openBluetoothAdapter({ success: resolve, fail: reject })
      })
    } catch (e) {
      this.setData({ scanning: false, statusText: '打开蓝牙失败：' + (e.errMsg || '') })
      wx.showToast({ title: '请开启蓝牙', icon: 'none' })
      return
    }

    wx.onBluetoothDeviceFound((res) => {
      const found = res.devices || []
      const map = {}
      this.data.devices.forEach((d) => {
        map[d.deviceId] = d
      })
      found.forEach((d) => {
        if (!d.deviceId) return
        map[d.deviceId] = {
          deviceId: d.deviceId,
          name: d.name || d.localName || ''
        }
      })
      this.setData({ devices: Object.values(map) })
    })

    try {
      await new Promise((resolve, reject) => {
        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: false,
          success: resolve,
          fail: reject
        })
      })
    } catch (e) {
      this.setData({ scanning: false, statusText: '扫描失败：' + (e.errMsg || '') })
      return
    }

    this.setData({
      scanning: false,
      statusText: '扫描中，请将设备靠近手机；点击列表项连接并下发 wifi_config'
    })
  },
  selectDev(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedId: id })
    this.connectAndSend(id)
  },
  onPickDevice() {
    const { devices } = this.data
    if (!devices.length) return
    const names = devices.map((d) => d.name || d.deviceId)
    wx.showActionSheet({
      itemList: names,
      success: (res) => {
        const dev = devices[res.tapIndex]
        if (dev) this.connectAndSend(dev.deviceId)
      }
    })
  },
  async connectAndSend(deviceId) {
    const { ssid, wifiPwd, token } = this.data
    this.setData({ statusText: '连接中...' })
    wx.stopBluetoothDevicesDiscovery()
    try {
      await new Promise((resolve, reject) => {
        wx.createBLEConnection({ deviceId, success: resolve, fail: reject })
      })
    } catch (e) {
      this.setData({ statusText: '连接失败：' + (e.errMsg || '') })
      return
    }

    let serviceId = ''
    let rxId = ''
    let txId = ''
    try {
      const svcs = await new Promise((resolve, reject) => {
        wx.getBLEDeviceServices({ deviceId, success: (r) => resolve(r.services), fail: reject })
      })
      const target = (svcs || []).find(
        (s) => ble.normalizeUuid(s.uuid) === ble.normalizeUuid(ble.SERVICE_UUID)
      )
      if (!target) {
        this.setData({ statusText: '未找到协议约定的 Service UUID（见协议文档第 7 节）' })
        return
      }
      serviceId = target.uuid
      const chars = await new Promise((resolve, reject) => {
        wx.getBLEDeviceCharacteristics({
          deviceId,
          serviceId,
          success: (r) => resolve(r.characteristics),
          fail: reject
        })
      })
      const rx = (chars || []).find(
        (c) => ble.normalizeUuid(c.uuid) === ble.normalizeUuid(ble.RX_CHAR_UUID)
      )
      const tx = (chars || []).find(
        (c) => ble.normalizeUuid(c.uuid) === ble.normalizeUuid(ble.TX_CHAR_UUID)
      )
      if (!rx || !tx) {
        this.setData({ statusText: '未找到 RX/TX 特征 UUID（见协议文档第 7 节）' })
        return
      }
      rxId = rx.uuid
      txId = tx.uuid
    } catch (e) {
      this.setData({ statusText: '读取服务失败：' + (e.errMsg || '') })
      return
    }

    await new Promise((resolve, reject) => {
      wx.notifyBLECharacteristicValueChange({
        deviceId,
        serviceId,
        characteristicId: txId,
        state: true,
        success: resolve,
        fail: reject
      })
    }).catch((e) => {
      this.setData({ statusText: '订阅通知失败：' + (e.errMsg || '') })
    })

    wx.onBLECharacteristicValueChange((res) => {
      if (res.characteristicId !== txId) return
      const json = ble.parseNotifyJson(res.value)
      const line = JSON.stringify(json)
      this.setData({
        statusText: this.data.statusText + '\n设备上报: ' + line
      })
      if (json && json.type === 'wifi_result') {
        wx.showToast({
          title: json.ok ? '配网成功' : '配网失败',
          icon: json.ok ? 'success' : 'none'
        })
      }
    })

    const frame = ble.buildWifiConfigFrame({ ssid, password: wifiPwd, token: token || undefined })
    const buffer = str2ab(frame)
    try {
      await new Promise((resolve, reject) => {
        wx.writeBLECharacteristicValue({
          deviceId,
          serviceId,
          characteristicId: rxId,
          value: buffer,
          success: resolve,
          fail: reject
        })
      })
      this.setData({
        statusText: this.data.statusText + '\n已写入 wifi_config 帧：' + frame
      })
    } catch (e) {
      this.setData({ statusText: '写入失败：' + (e.errMsg || '') })
    }
  },
  goBind() {
    wx.navigateTo({ url: '/pages/bind/bind' })
  }
})
