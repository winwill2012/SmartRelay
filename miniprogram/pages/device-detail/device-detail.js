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
    hasFirmwareUpdate: false
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
        loading: false
      })
      this._refreshFirmwareUpdateHint(device.device_id)
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async _refreshFirmwareUpdateHint(deviceId) {
    if (!deviceId) {
      this.setData({ hasFirmwareUpdate: false })
      return
    }
    const reqId = (this._fwCheckReqId || 0) + 1
    this._fwCheckReqId = reqId
    try {
      const data = await api.otaCheck(deviceId)
      if (reqId !== this._fwCheckReqId) return
      const has = !!(data && data.latest && data.update_available)
      this.setData({ hasFirmwareUpdate: has })
    } catch (e) {
      if (reqId !== this._fwCheckReqId) return
      this.setData({ hasFirmwareUpdate: false })
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

  onShareAppMessage() {
    const d = this.data.device || {}
    const title = `邀请你使用设备：${d.name || '一念开合'}`
    const fallback = '/pages/login/login'
    if (d.role !== 'owner' || !d.device_id) {
      return { title, path: fallback }
    }
    // 基础库 2.11+：promise 在分享面板打开后解析，实现单次点击再请求后端生成邀请链
    const promise = api
      .postShare(d.device_id, { expires_hours: 72 })
      .then((res) => ({
        title,
        path: (res && res.share_path) || fallback
      }))
      .catch((e) => {
        wx.showToast({ title: e.message || '生成邀请失败', icon: 'none' })
        return { title, path: fallback }
      })
    return { title, path: fallback, promise }
  }
})
