const api = require('../../utils/api.js')
const app = getApp()

Page({
  data: {
    device_id: '',
    fw_version: '',
    submitting: false,
    remark: '新设备'
  },

  onLoad(q) {
    const pr = app.globalData.provisionResult || {}
    const device_id = q.device_id || pr.device_id || ''
    const fw_version = pr.fw_version || ''
    this.setData({
      device_id,
      fw_version
    })
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  async onBind() {
    const { device_id, remark } = this.data
    if (!device_id) {
      wx.showToast({ title: '缺少设备 ID', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await api.bindDevice({
        device_id,
        name: remark || '新设备'
      })
      app.globalData.provisionResult = null
      wx.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/devices/devices' })
      }, 500)
    } catch (e) {
      wx.showToast({ title: e.message || '绑定失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
