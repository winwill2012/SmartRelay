const api = require('../../utils/api.js')

function formatShareTime(iso) {
  if (!iso) return '-'
  const s = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s
  let d = new Date(s)
  if (Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    d = new Date(s.replace(/(\.\d{3})?Z?$/, ''))
  }
  if (Number.isNaN(d.getTime())) return s
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`
}

function decorateList(raw) {
  return (raw || []).map((x) =>
    Object.assign({}, x, { created_at_text: formatShareTime(x.created_at) })
  )
}

Page({
  data: {
    loading: true,
    deviceId: '',
    list: []
  },

  onLoad(q) {
    this.setData({ deviceId: q.device_id || q.id || '' })
  },

  onShow() {
    if (this.data.deviceId) this.load()
  },

  async load() {
    const deviceId = this.data.deviceId
    if (!deviceId) {
      this.setData({ loading: false, list: [] })
      return
    }
    this.setData({ loading: true })
    try {
      const data = await api.getDeviceShares(deviceId)
      const list = Array.isArray(data) ? data : data.list || data.items || []
      this.setData({ list: decorateList(list), loading: false })
    } catch (e) {
      this.setData({ loading: false, list: [] })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onViewDetail(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.list[idx]
    if (!item) return
    const lines = [
      `被分享者：${item.target_display_name || '-'}`,
      `状态：${item.status_text || item.status || '-'}`,
      `创建时间：${item.created_at_text || formatShareTime(item.created_at)}`,
      `过期时间：${formatShareTime(item.expires_at)}`,
      `接受时间：${formatShareTime(item.accepted_at)}`
    ]
    wx.showModal({
      title: '分享详情',
      content: lines.join('\n'),
      showCancel: false
    })
  },

  async onCancelShare(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.list[idx]
    const shareId = item && String(item.id || '').trim()
    if (!shareId) {
      wx.showToast({ title: '记录无效', icon: 'none' })
      return
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '取消分享',
        content: '确认取消该分享吗？',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      })
    })
    if (!ok) return
    try {
      await api.revokeShare(shareId)
      wx.showToast({ title: '已取消', icon: 'success' })
      this.load()
    } catch (err) {
      wx.showToast({ title: err.message || '取消失败', icon: 'none' })
    }
  }
})
