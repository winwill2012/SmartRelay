const SUPPORT_EMAIL = 'admin@welinklab.com'

Page({
  data: {
    email: SUPPORT_EMAIL
  },

  onCopyEmail() {
    wx.setClipboardData({
      data: SUPPORT_EMAIL,
      success: () => {
        wx.showToast({ title: '邮箱已复制', icon: 'success' })
      }
    })
  }
})
