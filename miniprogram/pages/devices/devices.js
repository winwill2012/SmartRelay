const api = require('../../utils/api.js')
const mock = require('../../utils/mock.js')

const USE_MOCK = false

Page({
  data: {
    loading: true,
    error: '',
    devices: []
  },
  onShow() {
    this.loadList()
  },
  async loadList() {
    this.setData({ loading: true, error: '' })
    try {
      let list = []
      if (USE_MOCK) {
        await mock.mockDelay(300)
        list = mock.MOCK_DEVICES
      } else {
        const data = await api.getDevices()
        list = Array.isArray(data) ? data : data.items || data.devices || []
      }
      this.setData({ devices: list, loading: false })
    } catch (e) {
      const msg =
        (e && typeof e.message === 'string' && e.message) ||
        (typeof e === 'string' ? e : '') ||
        '加载失败'
      this.setData({
        loading: false,
        error: msg
      })
    }
  },
  onAddDevice() {
    wx.navigateTo({ url: '/pages/provision/provision' })
  },
  openDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  }
})
