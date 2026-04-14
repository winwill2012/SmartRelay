const api = require('../../utils/api.js')
const app = getApp()

/** 与固件 device_id（如 SR-8856A67C00FC）对齐，用末尾若干位作默认备注，避免多台都叫「新设备」 */
function defaultRemarkFromDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return '新设备'
  const hex = String(deviceId)
    .trim()
    .toUpperCase()
    .replace(/^SR-/i, '')
    .replace(/[^0-9A-F]/g, '')
  if (!hex) return '新设备'
  const tail = hex.length >= 4 ? hex.slice(-4) : hex
  return `新设备 ${tail}`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Page({
  data: {
    device_id: '',
    fw_version: '',
    submitting: false,
    remark: ''
  },

  onLoad(q) {
    const pr = app.globalData.provisionResult || {}
    const device_id = q.device_id || pr.device_id || ''
    const fw_version = pr.fw_version || ''
    const remark = defaultRemarkFromDeviceId(device_id)
    this.setData({
      device_id,
      fw_version,
      remark
    })
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  copyDeviceId(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.setClipboardData({
      data: String(id),
      success: () => wx.showToast({ title: '设备ID已复制', icon: 'none' })
    })
  },

  async onBind() {
    const { device_id, remark } = this.data
    if (!device_id) {
      wx.showToast({ title: '缺少设备 ID', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const bindPayload = {
        device_id,
        name: (remark && String(remark).trim()) || defaultRemarkFromDeviceId(device_id)
      }
      // 配网成功后设备首次上报云端可能有数秒延迟；对「设备初始化中」类提示做短时重试，降低偶发失败。
      let bound = false
      let lastErr = null
      for (let i = 0; i < 8; i++) {
        try {
          await api.bindDevice(bindPayload)
          bound = true
          break
        } catch (e) {
          lastErr = e
          const msg = ((e && e.message) || '').trim()
          if (!msg.includes('设备不存在') && !msg.includes('设备正在初始化')) throw e
          if (i < 7) await sleep(1000)
        }
      }
      if (!bound) throw lastErr || new Error('绑定失败')
      app.globalData.provisionResult = null
      wx.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/devices/devices' })
      }, 500)
    } catch (e) {
      const msg = (e && e.message) || '绑定失败'
      if (msg.includes('已绑定该设备')) {
        app.globalData.provisionResult = null
        wx.showToast({
          title: '该设备已在当前账号下绑定',
          icon: 'none',
          duration: 2000
        })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/devices/devices' })
        }, 1900)
      } else if (msg.includes('已被其他用户绑定')) {
        wx.showToast({
          title: '该设备已被其他账号绑定，无法重复绑定',
          icon: 'none',
          duration: 3200
        })
      } else {
        wx.showToast({ title: msg, icon: 'none' })
      }
    } finally {
      this.setData({ submitting: false })
    }
  }
})
