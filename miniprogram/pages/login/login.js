const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')

Page({
  data: { loading: false },

  onWxLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })
    this._loginWithRetry(0)
  },

  /**
   * attempt: 0 首次；1 表示 invalid code 后已换新 code 再试（code 仅能使用一次，重复请求会 invalid code）
   */
  _loginWithRetry(attempt) {
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false })
          wx.showToast({ title: '获取 code 失败', icon: 'none' })
          return
        }
        // 模拟器会返回固定假 code，微信接口必失败（见 README）
        if (res.code === 'thecodetislalmocklong') {
          this.setData({ loading: false })
          wx.showModal({
            title: '当前为模拟器假 code',
            content:
              '微信开发者工具模拟器返回的 login code 不能用于换 session。请使用顶部「真机调试」用手机微信扫码，或在「详情→本地设置」中关闭与 Mock 相关的选项后再试。',
            showCancel: false
          })
          return
        }
        api
          .authWechat(res.code)
          .then((data) => {
            const token = data.access_token || data.token
            if (!token) {
              throw new Error('未返回 access_token')
            }
            auth.setToken(token)
            wx.showToast({ title: '登录成功', icon: 'success' })
            setTimeout(() => {
              wx.switchTab({ url: '/pages/devices/devices' })
            }, 400)
            this.setData({ loading: false })
          })
          .catch((e) => {
            const msg = e && e.message ? e.message : ''
            if (attempt === 0 && /invalid code/i.test(msg)) {
              this._loginWithRetry(1)
              return
            }
            if (msg.indexOf('真机无法访问') !== -1) {
              wx.showModal({
                title: '真机请改 apiBase',
                content:
                  '真机不能访问 127.0.0.1。\n\n1. 电脑与手机同一 WiFi\n2. 电脑 cmd 执行 ipconfig，记下 IPv4（如 192.168.1.5）\n3. 修改 miniprogram/app.js：globalData.apiBase = \'http://该IP:8000/api/v1\'\n4. 后端：uvicorn --host 0.0.0.0 --port 8000\n5. 仍失败则检查 Windows 防火墙放行 8000',
                showCancel: false
              })
            } else {
              wx.showToast({ title: msg || '登录失败', icon: 'none' })
            }
            this.setData({ loading: false })
          })
      },
      fail: () => {
        this.setData({ loading: false })
        wx.showToast({ title: 'wx.login 失败', icon: 'none' })
      }
    })
  }
})
