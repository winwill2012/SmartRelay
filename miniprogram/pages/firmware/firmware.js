const api = require('../../utils/api.js')

Page({
  data: {
    device_id: '',
    loading: false,
    result: null
  },

  onLoad(q) {
    this.setData({ device_id: q.device_id || '' })
  },

  async onCheck() {
    if (!this.data.device_id) return
    this.setData({ loading: true, result: null })
    try {
      const data = await api.otaCheck(this.data.device_id)
      this.setData({ result: data, loading: false })
      if (data && data.up_to_date) {
        wx.showToast({ title: '已是最新版本', icon: 'none' })
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '检查失败', icon: 'none' })
    }
  }
})
