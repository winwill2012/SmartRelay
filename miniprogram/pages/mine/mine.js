const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')

Page({
  data: {
    loggedIn: false,
    nickname: '',
    deviceCount: 0,
    scheduleCount: 0,
    notifyCount: 0
  },

  onShow() {
    const loggedIn = auth.isLoggedIn()
    this.setData({ loggedIn })
    if (loggedIn) {
      this.loadMe()
      this.loadNotifyCount()
    } else {
      this.setData({
        deviceCount: 0,
        scheduleCount: 0,
        notifyCount: 0,
        nickname: ''
      })
    }
  },

  async loadMe() {
    try {
      const data = await api.getUserMe()
      const stats = data.stats || {}
      const deviceCount =
        data.device_count != null
          ? data.device_count
          : stats.device_count != null
            ? stats.device_count
            : data.bound_device_count || 0
      const scheduleCount =
        data.schedule_count != null
          ? data.schedule_count
          : stats.schedule_count != null
            ? stats.schedule_count
            : data.timer_count || 0
      const nickname = (data.nickname || data.nick_name || '').trim()
      this.setData({
        nickname,
        deviceCount,
        scheduleCount
      })
    } catch (e) {
      /* 静默 */
    }
  },

  async onTapNickname() {
    const current = this.data.nickname || ''
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '修改昵称',
        editable: true,
        placeholderText: '请输入昵称',
        content: current,
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!res || !res.confirm) return
    const v = String(res.content || '').trim()
    if (!v || v === current) return
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      await api.patchUserMe({ nickname: v })
      this.setData({ nickname: v })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadNotifyCount() {
    try {
      const data = await api.getNotifications()
      const list = Array.isArray(data) ? data : data.list || data.items || []
      const unread = list.filter((n) => n && !n.read).length
      this.setData({ notifyCount: unread || list.length })
    } catch (e) {
      this.setData({ notifyCount: 0 })
    }
  },

  onLogout() {
    auth.setToken('')
    this.setData({
      loggedIn: false,
      deviceCount: 0,
      scheduleCount: 0,
      notifyCount: 0,
      nickname: ''
    })
    wx.showToast({ title: '已退出', icon: 'success' })
  }
})
