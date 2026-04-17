const api = require('../../utils/api.js')
const { uuid } = require('../../utils/uuid.js')
const feedback = require('../../utils/feedback.js')
const app = getApp()

function pickDevice(list, id) {
  const arr = Array.isArray(list) ? list : list.list || list.items || []
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i]
    const did = d.device_id || d.deviceId || String(d.id)
    if (did === id) {
      return {
        device_id: did,
        name: d.name || d.remark || '未命名设备',
        role: d.role || 'owner',
        online: !!d.online,
        relay_on: !!d.relay_on,
        fw_version: d.fw_version || ''
      }
    }
  }
  return null
}

Page({
  data: {
    loading: true,
    device: {},
    encodedName: '',
    sharePath: '',
    shareReady: false
  },

  onLoad(q) {
    this.deviceId = q.id || q.device_id || ''
  },

  onShow() {
    if (this.deviceId) {
      this.refresh()
    }
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const data = await api.getDevices()
      const device = pickDevice(data, this.deviceId)
      if (!device) {
        wx.showToast({ title: '设备不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 500)
        return
      }
      this.setData({
        device,
        encodedName: encodeURIComponent(device.name || ''),
        shareReady: false,
        sharePath: '',
        loading: false
      })
      if (device.role === 'owner') {
        this.ensureSharePath()
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async onToggle() {
    const d = this.data.device
    if (!d.device_id) return
    const next = !d.relay_on
    feedback.uiTapFeedback()
    wx.showLoading({ title: '发送中…', mask: true })
    try {
      await api.postCommand(d.device_id, {
        type: 'relay.set',
        payload: { on: next },
        client_cmd_id: uuid()
      })
      this.setData({ device: { ...d, relay_on: next } })
      app.globalData.deviceStatePatch = {
        device_id: d.device_id,
        relay_on: next,
        at: Date.now()
      }
      wx.hideLoading()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '失败', icon: 'none' })
    }
  },

  onUnbind() {
    const id = this.deviceId
    const role = (this.data.device && this.data.device.role) || 'owner'
    const isShared = role !== 'owner'
    wx.showModal({
      title: isShared ? '结束共享' : '解绑设备',
      content: isShared ? '结束后将不再拥有该设备控制权限，确认吗？' : '解绑后将无法远程控制，确认吗？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: isShared ? '处理中…' : '解绑中…', mask: true })
        try {
          await api.unbindDevice(id)
          wx.hideLoading()
          wx.showToast({ title: isShared ? '已结束共享' : '已解绑', icon: 'success' })
          setTimeout(() => {
            if (isShared) wx.switchTab({ url: '/pages/devices/devices' })
            else wx.navigateBack()
          }, 400)
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: e.message || (isShared ? '结束共享失败' : '解绑失败'), icon: 'none' })
        }
      }
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

  async onPrepareShare() {
    await this.ensureSharePath(true)
  },

  async ensureSharePath(forceRefresh) {
    const d = this.data.device || {}
    if (!d.device_id) return ''
    if (d.role !== 'owner') return ''
    if (!forceRefresh && this.data.sharePath) return this.data.sharePath
    try {
      const res = await api.postShare(d.device_id, { expires_hours: 72 })
      const p = (res && res.share_path) || ''
      if (!p) {
        this.setData({ sharePath: '', shareReady: false })
        wx.showToast({ title: '分享服务未就绪，请升级后端', icon: 'none' })
        return ''
      }
      this.setData({ sharePath: p, shareReady: !!p })
      return p
    } catch (e) {
      this.setData({ shareReady: false })
      wx.showToast({ title: e.message || '生成分享链接失败', icon: 'none' })
      return ''
    }
  },

  onShareAppMessage() {
    const d = this.data.device
    const path = this.data.sharePath || '/pages/login/login'
    if (!this.data.sharePath) {
      wx.showToast({ title: '分享链接准备中，请稍后重试', icon: 'none' })
      this.ensureSharePath(true)
    }
    return {
      title: `邀请你使用设备：${d.name || '一念开合'}`,
      path
    }
  }
})
