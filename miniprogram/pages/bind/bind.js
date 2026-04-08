const api = require('../../utils/api.js')

Page({
  data: {
    deviceSn: '',
    mqttPassword: '',
    loading: false
  },
  onSn(e) {
    this.setData({ deviceSn: (e.detail.value || '').trim().toUpperCase() })
  },
  onPwd(e) {
    this.setData({ mqttPassword: e.detail.value })
  },
  async onBind() {
    const { deviceSn, mqttPassword } = this.data
    if (!deviceSn || !mqttPassword) {
      wx.showToast({ title: '请填写完整', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      await api.bindDevice({
        device_sn: deviceSn,
        mqtt_password: mqttPassword
      })
      wx.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/devices/devices' })
      }, 400)
    } catch (e) {
      wx.showToast({ title: e.message || '绑定失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
