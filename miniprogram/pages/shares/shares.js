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

Page({
  data: {
    loading: true,
    createdList: [],
    joinedList: []
  },

  onLoad(query) {
    const raw = query && query.share_token ? query.share_token : ''
    this.shareToken = raw ? decodeURIComponent(raw) : ''
    this.acceptedOnce = false
  },

  onShow() {
    this.tryAcceptThenLoad()
  },

  async tryAcceptThenLoad() {
    if (this.shareToken && !this.acceptedOnce) {
      this.acceptedOnce = true
      try {
        await api.acceptShare(this.shareToken)
        wx.showToast({ title: '已接受分享，可在首页控制设备', icon: 'success' })
      } catch (e) {
        wx.showToast({ title: e.message || '接受分享失败', icon: 'none' })
      }
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.getShares()
      const list = Array.isArray(data) ? data : data.list || data.items || []
      const createdList = list.filter((x) => x && x.role === 'owner')
      const joinedList = list.filter((x) => x && x.role === 'target')
      this.setData({ createdList, joinedList, loading: false })
    } catch (e) {
      this.setData({ loading: false, createdList: [], joinedList: [] })
    }
  },

  _getShareId(item) {
    if (!item || typeof item !== 'object') return ''
    return String(item.id || item.share_id || item.token_id || '').trim()
  },

  _formatShareDetail(item) {
    if (!item || typeof item !== 'object') return '暂无详情'
    const disp =
      item.device_display_name || item.device_name || item.device_id || '-'
    const lines = [
      `设备名称：${disp}`,
      `设备ID：${item.device_id || '-'}`,
      `状态：${item.status_text || item.status || item.role || '-'}`
    ]
    if (item.role === 'owner') {
      lines.push(
        `分享给：${item.target_display_name || item.target_nickname || item.target_phone || item.target_openid || '-'}`
      )
    } else {
      lines.push(`来源：${item.owner_display_name || '设备拥有者'}`)
    }
    lines.push(`创建时间：${formatShareTime(item.created_at || item.createdAt)}`)
    return lines.join('\n')
  },

  onViewDetail(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const group = e.currentTarget.dataset.group
    const arr = group === 'joined' ? this.data.joinedList : this.data.createdList
    const item = arr[idx]
    if (group === 'joined') {
      wx.switchTab({ url: '/pages/devices/devices' })
      return
    }
    wx.showModal({
      title: '分享详情',
      content: this._formatShareDetail(item),
      showCancel: false
    })
  },

  copyDeviceId(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.setClipboardData({
      data: String(id),
      success: () => wx.showToast({ title: '设备ID已复制', icon: 'none' })
    })
  },

  async onCancelShare(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.createdList[idx]
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
      await api.revokeShare(shareId)
      wx.showToast({ title: '已取消', icon: 'success' })
      this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '取消失败', icon: 'none' })
    }
  }
})
