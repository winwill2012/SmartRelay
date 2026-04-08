const api = require('../../utils/api.js')
const mock = require('../../utils/mock.js')

const USE_MOCK = false

Page({
  data: {
    deviceId: '',
    loading: true,
    items: [],
    actions: ['relay_on', 'relay_off'],
    actionIndex: 0,
    form: {
      cron_expr: '0 0 8 * * ?'
    },
    saving: false
  },
  onLoad(q) {
    this.setData({ deviceId: q.id || '' })
  },
  onShow() {
    this.load()
  },
  async load() {
    const { deviceId } = this.data
    if (!deviceId) return
    this.setData({ loading: true })
    try {
      if (USE_MOCK) {
        await mock.mockDelay(200)
        this.setData({
          items: [],
          loading: false
        })
        return
      }
      const data = await api.getSchedules(deviceId)
      const items = Array.isArray(data) ? data : data.items || data.schedules || []
      this.setData({ items, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  onCron(e) {
    this.setData({ 'form.cron_expr': e.detail.value })
  },
  onActionPick(e) {
    this.setData({ actionIndex: Number(e.detail.value) })
  },
  async onCreate() {
    const { deviceId, form, actions, actionIndex, items } = this.data
    if (items.length >= 10) {
      wx.showToast({ title: '已达上限 10 条', icon: 'none' })
      return
    }
    const cron_expr = (form.cron_expr || '').trim()
    if (!cron_expr) {
      wx.showToast({ title: '请填写 cron', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      if (!USE_MOCK) {
        await api.postSchedule(deviceId, {
          cron_expr,
          action: actions[actionIndex],
          enabled: 1
        })
      }
      wx.showToast({ title: '已创建', icon: 'success' })
      await this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
  async onToggle(e) {
    const id = e.currentTarget.dataset.id
    const enabled = e.detail.value ? 1 : 0
    const { deviceId } = this.data
    try {
      if (!USE_MOCK) {
        await api.patchSchedule(deviceId, id, { enabled })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' })
      this.load()
    }
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find((x) => x.id === id)
    if (!item) return
    wx.showModal({
      title: '编辑 cron',
      editable: true,
      placeholderText: item.cron_expr,
      success: async (res) => {
        if (!res.confirm) return
        const cron_expr = (res.content || '').trim()
        try {
          if (!USE_MOCK) {
            await api.patchSchedule(this.data.deviceId, id, { cron_expr })
          }
          wx.showToast({ title: '已更新', icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      }
    })
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除定时',
      content: '确定删除该条？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!USE_MOCK) {
            await api.deleteSchedule(this.data.deviceId, id)
          }
          wx.showToast({ title: '已删除', icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      }
    })
  }
})
