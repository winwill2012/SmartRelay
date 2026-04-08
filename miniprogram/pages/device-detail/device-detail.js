const api = require('../../utils/api.js')
const mock = require('../../utils/mock.js')

const USE_MOCK = false

Page({
  data: {
    id: '',
    device: null,
    loading: true,
    cmdLoading: false
  },
  onLoad(query) {
    this.setData({ id: query.id || '' })
  },
  onShow() {
    this.loadDevice()
  },
  async loadDevice() {
    const { id } = this.data
    if (!id) {
      this.setData({ loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      if (USE_MOCK) {
        await mock.mockDelay(200)
        const d = mock.MOCK_DEVICES.find((x) => x.id === id)
        this.setData({ device: d || null, loading: false })
        return
      }
      const list = await api.getDevices()
      const arr = Array.isArray(list) ? list : list.items || list.devices || []
      const device =
        arr.find((x) => x.device_id === id || x.id === id) || null
      this.setData({ device, loading: false })
    } catch (e) {
      this.setData({ loading: false, device: null })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  async onRelayChange(e) {
    const on = !!e.detail.value
    const { id, device } = this.data
    if (!device) return
    this.setData({ cmdLoading: true })
    wx.showLoading({ title: '下发中', mask: true })
    try {
      if (USE_MOCK) {
        await mock.mockDelay(400)
        this.setData({
          'device.relay_state': on ? 1 : 0,
          cmdLoading: false
        })
        wx.hideLoading()
        return
      }
      const res = await api.postCommand(id, on)
      const cmdId = res.cmd_id || res.cmdId
      if (cmdId) {
        try {
          await api.getCommandStatus(id, cmdId)
        } catch (err) {
          // 可选接口未实现时忽略
        }
      }
      await this.loadDevice()
    } catch (err) {
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      })
      this.setData({ cmdLoading: false })
      wx.hideLoading()
      return
    }
    this.setData({ cmdLoading: false })
    wx.hideLoading()
  },
  goLogs() {
    wx.navigateTo({ url: `/pages/logs/logs?id=${this.data.id}` })
  },
  goSchedules() {
    wx.navigateTo({ url: `/pages/schedules/schedules?id=${this.data.id}` })
  },
  onEditRemark() {
    const { device, id } = this.data
    if (!device) return
    wx.showModal({
      title: '修改备注',
      editable: true,
      placeholderText: device.remark_name || '',
      success: async (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        try {
          if (!USE_MOCK) {
            await api.patchDevice(id, { remark_name: name })
          }
          this.setData({ 'device.remark_name': name })
          wx.showToast({ title: '已保存', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: e.message || '失败', icon: 'none' })
        }
      }
    })
  },
  onUnbind() {
    const { id } = this.data
    wx.showModal({
      title: '解绑设备',
      content: '解绑后需重新绑定方可控制，确定吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!USE_MOCK) {
            await api.unbindDevice(id)
          }
          wx.showToast({ title: '已解绑', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 500)
        } catch (e) {
          wx.showToast({ title: e.message || '失败', icon: 'none' })
        }
      }
    })
  }
})
