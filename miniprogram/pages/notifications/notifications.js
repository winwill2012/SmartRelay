const api = require('../../utils/api.js')

Page({
  data: {
    loading: true,
    list: []
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.getNotifications()
      const list = Array.isArray(data) ? data : data.list || data.items || []
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ list: [], loading: false })
    }
  }
})
