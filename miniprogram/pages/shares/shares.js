const api = require('../../utils/api.js')

Page({
  data: {
    loading: true,
    list: [],
    show: false,
    deviceId: '',
    shareTo: ''
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.getShares()
      const list = Array.isArray(data) ? data : data.list || data.items || []
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ loading: false, list: [] })
    }
  },

  onOpen() {
    this.setData({ show: true, shareTo: '', deviceId: '' })
  },

  onClose() {
    this.setData({ show: false })
  },

  noop() {},

  onDevInput(e) {
    this.setData({ deviceId: e.detail.value })
  },

  onShareInput(e) {
    this.setData({ shareTo: e.detail.value })
  },

  async onConfirm() {
    const device_id = (this.data.deviceId || '').trim()
    const v = (this.data.shareTo || '').trim()
    if (!device_id) {
      wx.showToast({ title: '请输入设备 ID', icon: 'none' })
      return
    }
    if (!v) {
      wx.showToast({ title: '请输入手机号或 openid', icon: 'none' })
      return
    }
    const payload = /^1\d{10}$/.test(v)
      ? { phone: v }
      : { target_user_openid: v }
    try {
      await api.postShare(device_id, payload)
      wx.showToast({ title: '已发起', icon: 'success' })
      this.setData({ show: false })
      this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' })
    }
  }
})
