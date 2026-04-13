const api = require('../../utils/api.js')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 旧版后端 CommandBody 仅含 relay.*时会422；改走独立 /ota/start（需服务端已部署该路由） */
function isRelayOnlySchemaReject(e) {
  const msg = (e && e.message) || ''
  const st = e && e.httpStatus
  if (st === 422) return true
  if (/Input should be /i.test(msg) && /relay\.(set|toggle)/i.test(msg)) return true
  return false
}

async function requestOtaStart(deviceId) {
  try {
    return await api.postCommand(
      deviceId,
      { type: 'ota.start', payload: {} },
      { timeout: 60000 }
    )
  } catch (e1) {
    if (!isRelayOnlySchemaReject(e1)) throw e1
    return await api.otaStart(deviceId)
  }
}

Page({
  data: {
    device_id: '',
    loading: false,
    result: null,
    otaBusy: false,
    otaProgress: null,
    otaProgressPercent: 0
  },

  onLoad(q) {
    this.setData({ device_id: q.device_id || '' })
  },

  onUnload() {
    this._stopOtaPoll()
  },

  _stopOtaPoll() {
    if (this._otaPollTimer) {
      clearInterval(this._otaPollTimer)
      this._otaPollTimer = null
    }
  },

  async onCheck() {
    if (!this.data.device_id) return
    this.setData({ loading: true, result: null })
    try {
      const data = await api.otaCheck(this.data.device_id)
      this.setData({ result: data, loading: false })
      if (data && !data.latest) {
        wx.showToast({ title: '暂无已启用的固件', icon: 'none' })
      } else if (data && data.latest && data.update_available === false) {
        wx.showToast({ title: '已是最新版本', icon: 'none' })
      } else if (data && data.latest && data.update_available) {
        wx.showToast({ title: `发现新版本 v${data.latest.version}`, icon: 'none' })
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '检查失败', icon: 'none' })
    }
  },

  async onStartOta() {
    const { device_id, result, otaBusy } = this.data
    if (!device_id || !result || !result.update_available || !result.latest || otaBusy) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认升级',
        content: `将远程升级至 v${result.latest.version}，设备将重启，期间可能短暂离线。是否继续？`,
        success: (r) => resolve(!!r.confirm)
      })
    })
    if (!ok) return

    this.setData({ otaBusy: true, otaProgress: null, otaProgressPercent: 0 })
    wx.showLoading({ title: '下发中…', mask: true })
    try {
      const start = await requestOtaStart(device_id)
      wx.hideLoading()
      const cmdId = start && start.cmd_id
      if (!cmdId) {
        wx.showToast({ title: '未返回指令 ID', icon: 'none' })
        this.setData({ otaBusy: false })
        return
      }

      let ackFailMsg = ''
      for (let i = 0; i < 24; i++) {
        await sleep(400)
        try {
          const st = await api.getCommandStatus(device_id, cmdId)
          if (st.status === 'acked') {
            if (st.success === false) {
              ackFailMsg =
                st.error_message ||
                (st.ack && st.ack.error_message) ||
                '设备拒绝升级'
            }
            break
          }
        } catch (e) {
          /* 继续等待 ack */
        }
      }
      if (ackFailMsg) {
        wx.showToast({ title: ackFailMsg, icon: 'none', duration: 3000 })
        this.setData({ otaBusy: false })
        return
      }

      this.setData({
        otaProgress: { phase: '等待设备上报进度…', percent: null, active: true },
        otaProgressPercent: 0
      })
      this._otaStartTs = Date.now()
      this._stopOtaPoll()
      this._otaPollTimer = setInterval(() => {
        void this._pollOtaOnce()
      }, 1200)
      void this._pollOtaOnce()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '下发失败', icon: 'none' })
      this.setData({ otaBusy: false })
    }
  },

  async _pollOtaOnce() {
    const { device_id } = this.data
    if (!device_id || !this._otaPollTimer) return
    try {
      const p = await api.getOtaProgress(device_id)
      const pct = typeof p.percent === 'number' ? p.percent : null
      this.setData({
        otaProgress: p,
        otaProgressPercent: pct != null ? Math.max(0, Math.min(100, pct)) : this.data.otaProgressPercent
      })
      if (pct != null && pct >= 100 && String(p.phase || '') === 'done') {
        this._onOtaFinished(true)
        return
      }
      if (this._otaStartTs && Date.now() - this._otaStartTs > 300000) {
        this._onOtaFinished(false, '等待超时，请稍后在设备列表查看版本')
      }
    } catch (e) {
      /* 单次轮询失败忽略 */
    }
  },

  _onOtaFinished(success, msg) {
    this._stopOtaPoll()
    this.setData({ otaBusy: false })
    if (success) {
      wx.showToast({ title: '升级完成，设备重启中', icon: 'none', duration: 2500 })
      this.setData({ result: null, otaProgress: null, otaProgressPercent: 0 })
    } else if (msg) {
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
    }
  }
})
