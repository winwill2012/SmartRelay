const api = require('../../utils/api.js')
const mock = require('../../utils/mock.js')

const USE_MOCK = false

Page({
  data: {
    deviceId: '',
    page: 1,
    pageSize: 20,
    items: [],
    loading: true,
    loadingMore: false,
    hasMore: true
  },
  onLoad(q) {
    this.setData({ deviceId: q.id || '' })
  },
  onShow() {
    this.setData({ page: 1, items: [], hasMore: true }, () => {
      this.fetch(true)
    })
  },
  async fetch(reset) {
    const { deviceId, page, pageSize } = this.data
    if (!deviceId) return
    if (reset) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }
    try {
      if (USE_MOCK) {
        await mock.mockDelay(200)
        const items = [
          {
            id: 1,
            action: 'relay_on',
            source: 'miniapp',
            created_at: new Date().toISOString()
          }
        ]
        this.setData({
          items: reset ? items : this.data.items.concat(items),
          hasMore: false,
          loading: false,
          loadingMore: false
        })
        return
      }
      const data = await api.getLogs(deviceId, { page, page_size: pageSize })
      const list = data.items || data.list || data.logs || []
      const total = data.total
      const items = reset ? list : this.data.items.concat(list)
      let hasMore = true
      if (typeof total === 'number') {
        hasMore = items.length < total
      } else {
        hasMore = list.length >= pageSize
      }
      this.setData({
        items,
        hasMore,
        loading: false,
        loadingMore: false
      })
    } catch (e) {
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ page: this.data.page + 1 }, () => {
      this.fetch(false)
    })
  }
})
