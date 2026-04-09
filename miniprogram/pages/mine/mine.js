const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')

Page({
  data: {
    loggedIn: false,
    nickname: '',
    avatar: '',
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
        nickname: '',
        avatar: ''
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
      const avatar = (data.avatar_url || '').trim()
      this.setData({
        nickname,
        avatar,
        deviceCount,
        scheduleCount
      })
    } catch (e) {
      /* 静默 */
    }
  },

  async onChooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl
    if (!path) return
    wx.showLoading({ title: '上传中…', mask: true })
    try {
      const res = await api.uploadUserAvatar(path)
      const url = (res && res.avatar_url) || ''
      if (url) {
        this.setData({ avatar: url })
        wx.showToast({ title: '头像已更新', icon: 'success' })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onNicknameBlur(e) {
    const v = ((e.detail && e.detail.value) || '').trim()
    if (v === this.data.nickname) return
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      await api.patchUserMe({ nickname: v })
      this.setData({ nickname: v })
      wx.hideLoading()
      wx.showToast({ title: '昵称已保存', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
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
      nickname: '',
      avatar: ''
    })
    wx.showToast({ title: '已退出', icon: 'success' })
  }
})
