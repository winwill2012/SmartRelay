const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')
const { uuid } = require('../../utils/uuid.js')

function formatNextScheduleLine(d) {
  if (d.next_schedule_summary != null && String(d.next_schedule_summary).trim() !== '') {
    return String(d.next_schedule_summary)
  }
  const ns = d.next_schedule
  if (ns && typeof ns === 'object') {
    const t = ns.time_local || ''
    const act = ns.action === 'on' ? '开' : '关'
    return `最近定时：${t} | ${act}`
  }
  return ''
}

function normalizeDevice(d) {
  const id = d.device_id || d.deviceId || String(d.id || '')
  return {
    device_id: id,
    name: d.name || d.remark || '未命名设备',
    online: !!d.online,
    relay_on: d.relay_on === true,
    next_schedule_summary: formatNextScheduleLine(d)
  }
}

function applyFilter(list, mode) {
  return list.filter((item) => {
    if (mode === 'online') return item.online
    if (mode === 'offline') return !item.online
    if (mode === 'on') return item.relay_on
    if (mode === 'off') return !item.relay_on
    return true
  })
}

Page({
  data: {
    loggedIn: false,
    loading: false,
    error: '',
    rawList: [],
    displayList: [],
    filter: 'all',
    filterModes: [
      { id: 'all', label: '所有' },
      { id: 'online', label: '在线' },
      { id: 'offline', label: '离线' },
      { id: 'on', label: '打开' },
      { id: 'off', label: '关闭' }
    ]
  },

  onShow() {
    this.setData({ loggedIn: auth.isLoggedIn() })
    if (auth.isLoggedIn()) {
      this.loadDevices()
    }
  },

  async loadDevices(silent) {
    if (!silent) {
      this.setData({ loading: true, error: '' })
    }
    try {
      const data = await api.getDevices()
      const arr = Array.isArray(data) ? data : data.list || data.items || []
      const rawList = arr.map(normalizeDevice)
      const displayList = applyFilter(rawList, this.data.filter)
      this.setData({ rawList, displayList, loading: false })
    } catch (e) {
      if (!silent) {
        this.setData({
          loading: false,
          error: e.message || '加载失败',
          rawList: [],
          displayList: []
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: e.message || '刷新失败', icon: 'none' })
      }
    }
  },

  onPullDownRefresh() {
    if (!auth.isLoggedIn()) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadDevices(true)
      .catch(() => {})
      .finally(() => {
        wx.stopPullDownRefresh()
      })
  },

  onFilter(e) {
    const mode = e.currentTarget.dataset.mode
    const displayList = applyFilter(this.data.rawList, mode)
    this.setData({ filter: mode, displayList })
  },

  async onToggleRelay(e) {
    const id = e.currentTarget.dataset.id
    const on = e.currentTarget.dataset.on
    if (!id) return
    const next = !on
    wx.showLoading({ title: '指令发送…', mask: true })
    try {
      const client_cmd_id = uuid()
      await api.postCommand(id, {
        type: 'relay.set',
        payload: { on: next },
        client_cmd_id
      })
      const rawList = this.data.rawList.map((row) =>
        row.device_id === id ? { ...row, relay_on: next } : row
      )
      const displayList = applyFilter(rawList, this.data.filter)
      this.setData({ rawList, displayList })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }
})
