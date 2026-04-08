const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const mock = require('../../utils/mock.js')

const USE_MOCK = false

Page({
  data: {
    user: null,
    loginLoading: false,
    baseInput: ''
  },
  onShow() {
    this.setData({
      baseInput: config.getBaseURL()
    })
    this.refreshUser()
  },
  async refreshUser() {
    const token = wx.getStorageSync('token')
    if (!token) {
      this.setData({ user: null })
      return
    }
    try {
      if (USE_MOCK) {
        this.setData({ user: mock.MOCK_USER })
        return
      }
      const user = await api.getMe()
      this.setData({ user })
    } catch (e) {
      this.setData({ user: null })
    }
  },
  onBaseInput(e) {
    this.setData({ baseInput: e.detail.value })
  },
  saveBase() {
    const v = (this.data.baseInput || '').trim()
    if (!v) {
      wx.showToast({ title: '请输入地址', icon: 'none' })
      return
    }
    config.setBaseURL(v)
    const app = getApp()
    if (app && app.globalData) app.globalData.baseURL = v
    wx.showToast({ title: '已保存', icon: 'success' })
  },
  async onWxLogin() {
    this.setData({ loginLoading: true })
    try {
      if (USE_MOCK) {
        wx.setStorageSync('token', 'mock-token')
        await mock.mockDelay(200)
        this.setData({ user: mock.MOCK_USER, loginLoading: false })
        wx.showToast({ title: '登录成功', icon: 'success' })
        return
      }
      const login = await new Promise((resolve, reject) => {
        wx.login({
          success: (r) => resolve(r.code),
          fail: reject
        })
      })
      if (!login) {
        throw new Error('无法获取 code')
      }
      const data = await api.authWechat(login)
      if (data.token) wx.setStorageSync('token', data.token)
      this.setData({ user: data.user || data, loginLoading: false })
      wx.showToast({ title: '登录成功', icon: 'success' })
    } catch (e) {
      this.setData({ loginLoading: false })
      wx.showToast({
        title: e.message || '登录失败',
        icon: 'none'
      })
    }
  },
  logout() {
    wx.removeStorageSync('token')
    this.setData({ user: null })
    wx.showToast({ title: '已退出', icon: 'none' })
  }
})
