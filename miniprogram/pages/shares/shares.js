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
      const data = await api.getShares()
      const list = Array.isArray(data) ? data : data.list || data.items || []
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ loading: false, list: [] })
    }
  },

  _getShareId(item) {
    if (!item || typeof item !== 'object') return ''
    return String(item.id || item.share_id || item.token_id || '').trim()
  },

  _formatShareDetail(item) {
    if (!item || typeof item !== 'object') return '暂无详情'
    const lines = [
      `设备：${item.device_name || item.device_id || '-'}`,
      `状态：${item.status || item.role || '-'}`,
      `分享给：${item.target_nickname || item.target_phone || item.target_openid || '-'}`,
      `创建时间：${item.created_at || item.createdAt || '-'}`
    ]
    return lines.join('\n')
  },

  onViewDetail(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.list[idx]
    wx.showModal({
      title: '分享详情',
      content: this._formatShareDetail(item),
      showCancel: false
    })
  },

  async onCancelShare(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.list[idx]
    const shareId = this._getShareId(item)
    if (!shareId) {
      wx.showToast({ title: '该记录不支持取消', icon: 'none' })
      return
    }
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '取消分享',
        content: '确认取消该分享吗？',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      })
    })
    if (!confirm) return
    try {
      await api.request({
        url: `/shares/${encodeURIComponent(shareId)}`,
        method: 'DELETE'
      })
      wx.showToast({ title: '已取消', icon: 'success' })
      this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '取消失败', icon: 'none' })
    }
  }
})
