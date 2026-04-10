const api = require('../../utils/api.js')

const DEL_RPX = 160

function normalizeList(data) {
  const raw = Array.isArray(data) ? data : data.items || data.list || []
  return raw.map((x) => ({ ...x, swipeX: 0 }))
}

Page({
  data: {
    loading: true,
    list: []
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync()
      this._pxToRpx = 750 / (sys.windowWidth || 375)
    } catch (e) {
      this._pxToRpx = 2
    }
    this._touchIdx = null
    this._touchStartX = 0
    this._rowStartSwipe = 0
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const data = await api.getNotifications()
      const list = normalizeList(data)
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ list: [], loading: false })
    }
  },

  touchStart(e) {
    const i = e.currentTarget.dataset.index
    if (i === undefined) return
    const cur = this.data.list[i].swipeX || 0
    const list = this.data.list.map((row, idx) => ({
      ...row,
      swipeX: idx === i ? cur : 0
    }))
    this.setData({ list })
    this._touchIdx = i
    this._touchStartX = e.touches[0].clientX
    this._rowStartSwipe = cur
  },

  touchMove(e) {
    if (this._touchIdx == null) return
    const dxPx = e.touches[0].clientX - this._touchStartX
    const dxRpx = dxPx * this._pxToRpx
    let x = this._rowStartSwipe + dxRpx
    if (x > 0) x = 0
    if (x < -DEL_RPX) x = -DEL_RPX
    this.setData({ [`list[${this._touchIdx}].swipeX`]: x })
  },

  touchEnd() {
    if (this._touchIdx == null) return
    const i = this._touchIdx
    let x = this.data.list[i].swipeX || 0
    if (x < -DEL_RPX / 2) x = -DEL_RPX
    else x = 0
    this.setData({ [`list[${i}].swipeX`]: x })
    this._touchIdx = null
  },

  async onTapItem(e) {
    const index = e.currentTarget.dataset.index
    const id = e.currentTarget.dataset.id
    if (id == null || index == null) return
    const row = this.data.list[index]
    if (!row) return
    if ((row.swipeX || 0) < -40) {
      this.setData({ [`list[${index}].swipeX`]: 0 })
      return
    }
    if (row.read) return
    try {
      await api.patchNotificationRead(id)
      const list = this.data.list.map((x) =>
        String(x.id) === String(id) ? { ...x, read: true } : x
      )
      this.setData({ list })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    }
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    try {
      await api.deleteNotification(id)
      const list = this.data.list.filter((x) => String(x.id) !== String(id))
      this.setData({ list })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
    }
  }
})
