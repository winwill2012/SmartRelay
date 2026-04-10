const api = require('../../utils/api.js')

Page({
  data: {
    device_id: '',
    name: '',
    saving: false
  },

  onLoad(q) {
    this.setData({
      device_id: q.id || q.device_id || '',
      name: decodeURIComponent(q.name || '') || ''
    })
  },

  onInput(e) {
    this.setData({ name: e.detail.value })
  },

  async onSave() {
    const { device_id, name } = this.data
    if (!device_id) return
    const next = String(name || '').trim()
    if (!next) {
      wx.showToast({ title: '请输入备注名', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      await api.patchDevice(device_id, { name: next })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
