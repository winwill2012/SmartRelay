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
    otaProgressPercent: 0,
    otaPollHint: '',
    otaStageText: '',
    flowDownloadState: 'pending',
    flowInstallState: 'pending',
    flowRebootState: 'pending',
    flowDoneState: 'pending'
  },

  onLoad(q) {
    this.setData({ device_id: q.device_id || '' })
  },

  onUnload() {
    this._stopOtaPoll()
    this._stopPostCheck()
  },

  _stopOtaPoll() {
    if (this._otaPollTimer) {
      clearInterval(this._otaPollTimer)
      this._otaPollTimer = null
    }
  },

  _stopPostCheck() {
    if (this._postCheckTimer) {
      clearInterval(this._postCheckTimer)
      this._postCheckTimer = null
    }
  },

  _applyFlowByProgress(percent, phase) {
    let dl = 'active'
    let ins = 'pending'
    let reb = 'pending'
    let done = 'pending'
    let text = '下载中'
    const p = typeof percent === 'number' ? percent : 0
    const ph = String(phase || '').toLowerCase()
    if (p >= 95 || ph === 'verify' || ph === 'write') {
      dl = 'done'
      ins = 'active'
      text = '更新中'
    }
    if (p >= 100 || ph === 'done') {
      dl = 'done'
      ins = 'done'
      reb = 'active'
      text = '重启中'
    }
    this.setData({
      flowDownloadState: dl,
      flowInstallState: ins,
      flowRebootState: reb,
      flowDoneState: done,
      otaStageText: text
    })
  },

  async onCheck() {
    if (!this.data.device_id) return
    this._stopOtaPoll()
    this._stopPostCheck()
    this._otaMaxPercent = 0
    this._otaTargetVersion = ''
    this.setData({
      loading: true,
      result: null,
      otaBusy: false,
      otaProgress: null,
      otaProgressPercent: 0,
      otaPollHint: '',
      otaStageText: '',
      flowDownloadState: 'pending',
      flowInstallState: 'pending',
      flowRebootState: 'pending',
      flowDoneState: 'pending'
    })
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

    this.setData({
      otaBusy: true,
      otaProgress: null,
      otaProgressPercent: 0,
      otaPollHint: '',
      otaStageText: '准备中',
      flowDownloadState: 'active',
      flowInstallState: 'pending',
      flowRebootState: 'pending',
      flowDoneState: 'pending'
    })
    wx.showLoading({ title: '下发中…', mask: true })
    try {
      this._stopPostCheck()
      this._otaMaxPercent = 0
      this._otaTargetVersion = result.latest.version || ''
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
        otaProgressPercent: 0,
        otaPollHint: ''
      })
      this._applyFlowByProgress(0, 'download')
      this._otaPollOk = 0
      this._otaPollFail = 0
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

  _parseOtaPercent(raw) {
    if (raw == null || raw === '') return null
    if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.max(0, Math.min(100, Math.round(raw)))
    const n = Number(raw)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
  },

  async _pollOtaOnce() {
    const { device_id } = this.data
    if (!device_id || !this._otaPollTimer) return
    try {
      const p = await api.getOtaProgress(device_id)
      this._otaPollOk = (this._otaPollOk || 0) + 1
      let pct = this._parseOtaPercent(p.percent)
      const prevMax = typeof this._otaMaxPercent === 'number' ? this._otaMaxPercent : 0
      if (pct == null) pct = prevMax
      if (pct < prevMax) pct = prevMax
      this._otaMaxPercent = pct
      const nextPct = this._otaMaxPercent
      let hint = ''
      if (p && p.active === false && (pct == null || pct === 0) && !(p.phase && String(p.phase).trim())) {
        hint = '服务端暂无进度数据，请确认设备已上报 MQTT ota/progress'
      }
      this.setData({
        otaProgress: p,
        otaProgressPercent: nextPct,
        otaPollHint: hint
      })
      this._applyFlowByProgress(nextPct, p.phase)
      if (nextPct >= 100 && String(p.phase || '') === 'done') {
        this._onOtaFinished(true)
        return
      }
      if (this._otaStartTs && Date.now() - this._otaStartTs > 300000) {
        this._onOtaFinished(false, '等待超时，请稍后在设备列表查看版本')
      }
    } catch (e) {
      this._otaPollFail = (this._otaPollFail || 0) + 1
      const fails = this._otaPollFail
      if (fails === 3 || fails === 10) {
        this.setData({
          otaPollHint: `拉取进度失败(${fails}次)：${(e && e.message) || '网络错误'}`
        })
      }
    }
  },

  _onOtaFinished(success, msg) {
    this._stopOtaPoll()
    this._otaMaxPercent = Math.max(100, this._otaMaxPercent || 0)
    if (success) {
      wx.showToast({ title: '升级完成，设备重启中', icon: 'none', duration: 2500 })
      this.setData({
        otaBusy: true,
        otaProgressPercent: this._otaMaxPercent,
        flowDownloadState: 'done',
        flowInstallState: 'done',
        flowRebootState: 'active',
        flowDoneState: 'pending',
        otaStageText: '重启中',
        otaPollHint: '设备正在重启并回连，稍后会自动显示新版本。'
      })
      this._startPostRebootCheck()
    } else if (msg) {
      this.setData({ otaBusy: false })
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
    }
  },

  _startPostRebootCheck() {
    const deviceId = this.data.device_id
    const target = this._otaTargetVersion || ''
    if (!deviceId) {
      this.setData({ otaBusy: false })
      return
    }
    let tries = 0
    this._stopPostCheck()
    this._postCheckTimer = setInterval(async () => {
      tries++
      try {
        const d = await api.otaCheck(deviceId)
        const current = (d && d.current_version) || ''
        const latestVer = d && d.latest ? d.latest.version : ''
        const upAvail = !!(d && d.update_available)
        const reached =
          (target && current === target) ||
          (latestVer && current === latestVer && upAvail === false)
        if (reached) {
          this._stopPostCheck()
          this.setData({
            otaBusy: false,
            result: d,
            flowDownloadState: 'done',
            flowInstallState: 'done',
            flowRebootState: 'done',
            flowDoneState: 'done',
            otaStageText: '已完成',
            otaPollHint: '固件已更新到最新版'
          })
          return
        }
      } catch (e) {
        // 重启窗口内请求失败属预期，继续等待
      }
      if (tries >= 25) {
        this._stopPostCheck()
        this.setData({
          otaBusy: false,
          flowDownloadState: 'done',
          flowInstallState: 'done',
          flowRebootState: 'done',
          flowDoneState: 'active',
          otaStageText: '已完成',
          otaPollHint: '升级流程结束，但未自动确认新版本，请手动点击「检查更新」。'
        })
      }
    }, 2500)
  }
})
