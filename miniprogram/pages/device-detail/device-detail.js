const api = require('../../utils/api.js')
const { uuid } = require('../../utils/uuid.js')
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
    encodedName: ''
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
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async onToggle() {
    const d = this.data.device
    if (!d.device_id) return
    const next = !d.relay_on
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

  async onEditName() {
    const d = this.data.device || {}
    const id = d.device_id || this.deviceId
    if (!id) return
    const current = d.name || ''
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '修改备注名',
        editable: true,
        placeholderText: '请输入设备名称',
        content: current,
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!res || !res.confirm) return
    const next = String(res.content || '').trim()
    if (!next || next === current) return
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      await api.patchDevice(id, { name: next })
      this.setData({
        device: { ...d, name: next },
        encodedName: encodeURIComponent(next)
      })
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onUnbind() {
    const id = this.deviceId
    wx.showModal({
      title: '解绑设备',
      content: '解绑后将无法远程控制，确认吗？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '解绑中…', mask: true })
        try {
          await api.unbindDevice(id)
          wx.hideLoading()
          wx.showToast({ title: '已解绑', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        } catch (e) {
          wx.hideLoading()
          wx.showToast({ title: e.message || '解绑失败', icon: 'none' })
        }
      }
    })
  },

  onShareAppMessage() {
    const d = this.data.device
    return {
      title: `邀请你使用设备：${d.name || 'SmartRelay'}`,
      path: `/pages/login/login?from=${encodeURIComponent(d.device_id || '')}`
    }
  }
})
