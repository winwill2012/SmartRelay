const { getApiBase, isLocalhostApiBase } = require('./config.js')
const auth = require('./auth.js')

/**
 * 从非标准 JSON（如 FastAPI { detail }、网关 HTML）解析可读错误文案，避免出现「错误 undefined」
 */
function parseHttpErrorMessage(body, statusCode) {
  if (body && typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim()
  }
  const d = body && body.detail
  if (typeof d === 'string' && d.trim()) return d.trim()
  if (Array.isArray(d) && d.length) {
    const parts = d
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x.msg === 'string') return x.msg
        if (x && typeof x.message === 'string') return x.message
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (body && body.code !== undefined && body.code !== null) {
    return `错误码 ${body.code}`
  }
  if (statusCode && statusCode !== 200) {
    return `请求失败 (${statusCode})`
  }
  return '服务返回异常，请稍后重试'
}

/**
 * 通用响应：{ code, message, data }
 * code === 0 成功
 */
function request(options) {
  const { url, method = 'GET', data = {}, header = {}, timeout = 20000 } = options
  const base = getApiBase()
  const token = auth.getToken()
  const h = Object.assign(
    { 'Content-Type': 'application/json' },
    header
  )
  if (token) h.Authorization = `Bearer ${token}`

  const fullUrl = base + url
  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data: method === 'GET' ? data : data,
      header: h,
      timeout,
      success(res) {
        const body = res.data
        const status = res.statusCode || 0
        if (typeof body !== 'object' || body === null) {
          const err = new Error(
            status >= 400 ? `请求失败 (${status})` : '响应格式错误'
          )
          err.httpStatus = status
          reject(err)
          return
        }
        if (body.code === 0) {
          resolve(body.data)
          return
        }
        if (body.code !== undefined && body.code !== null && body.code !== 0) {
          const msg = parseHttpErrorMessage(body, status)
          const err = new Error(msg)
          err.code = body.code
          err.httpStatus = status
          reject(err)
          return
        }
        const err = new Error(parseHttpErrorMessage(body, status))
        if (body.code !== undefined) err.code = body.code
        err.httpStatus = status
        reject(err)
      },
      fail(err) {
        try {
          console.warn('[api] request fail', fullUrl, err)
        } catch (e) {}
        reject(new Error(formatRequestFail(err)))
      }
    })
  })
}

function formatRequestFail(err) {
  const raw = (err && err.errMsg) || String(err || '')
  if (/request:fail|fail connect|timeout|timed out/i.test(raw)) {
    if (isLocalhostApiBase()) {
      return '真机无法访问127.0.0.1：请在app.js把apiBase改为电脑局域网IP（如http://192.168.1.5:8000/api/v1）'
    }
    return '网络失败：确认后端已启动、apiBase可访问、防火墙放行8000端口'
  }
  return raw || '网络错误'
}

// —— 小程序 HTTP API（协议标准 §5.1）——

function authWechat(code) {
  return request({
    url: '/auth/wechat',
    method: 'POST',
    data: typeof code === 'object' && code !== null ? code : { code }
  })
}

function getUserMe() {
  return request({ url: '/user/me', method: 'GET' })
}

function patchUserMe(payload) {
  return request({ url: '/user/me', method: 'PATCH', data: payload || {} })
}

/** 头像：chooseAvatar 后 wx.uploadFile 到此接口，返回 { avatar_url } */
function uploadUserAvatar(filePath) {
  return new Promise((resolve, reject) => {
    const base = getApiBase()
    const token = auth.getToken()
    wx.uploadFile({
      url: base + '/user/me/avatar',
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        try {
          const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          if (res.statusCode !== 200) {
            reject(new Error('上传失败'))
            return
          }
          if (body.code === 0) {
            resolve(body.data)
            return
          }
          reject(new Error(body.message || '上传失败'))
        } catch (e) {
          reject(new Error('响应解析失败'))
        }
      },
      fail(err) {
        reject(new Error(formatRequestFail(err)))
      }
    })
  })
}

function getDevices() {
  return request({ url: '/devices', method: 'GET' })
}

function bindDevice(payload) {
  return request({ url: '/devices/bind', method: 'POST', data: payload })
}

function unbindDevice(deviceId) {
  return request({ url: `/devices/${encodeURIComponent(deviceId)}/bind`, method: 'DELETE' })
}

function patchDevice(deviceId, payload) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}`,
    method: 'PATCH',
    data: payload
  })
}

function postCommand(deviceId, payload, opts) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/command`,
    method: 'POST',
    data: payload,
    timeout: (opts && opts.timeout) || 20000
  })
}

function getCommandStatus(deviceId, cmdId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/command/${encodeURIComponent(cmdId)}`,
    method: 'GET'
  })
}

function getLogs(deviceId, query) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/logs`,
    method: 'GET',
    data: query || {}
  })
}

function getSchedules(deviceId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/schedules`,
    method: 'GET'
  })
}

function createSchedule(deviceId, payload) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/schedules`,
    method: 'POST',
    data: payload
  })
}

function patchSchedule(scheduleId, payload) {
  return request({
    url: `/schedules/${encodeURIComponent(scheduleId)}`,
    method: 'PATCH',
    data: payload
  })
}

function deleteSchedule(scheduleId) {
  return request({
    url: `/schedules/${encodeURIComponent(scheduleId)}`,
    method: 'DELETE'
  })
}

function postShare(deviceId, payload) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/share`,
    method: 'POST',
    data: payload
  })
}

function getShares() {
  return request({ url: '/shares', method: 'GET' })
}

function otaCheck(deviceId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/ota/check`,
    method: 'POST',
    data: {}
  })
}

function otaStart(deviceId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/ota/start`,
    method: 'POST',
    data: {},
    timeout: 60000
  })
}

function getOtaProgress(deviceId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/ota/progress`,
    method: 'GET'
  })
}

function getNotifications() {
  return request({ url: '/notifications', method: 'GET' })
}

function patchNotificationRead(notificationId) {
  return request({
    url: `/notifications/${encodeURIComponent(notificationId)}/read`,
    method: 'PATCH',
    data: {}
  })
}

function deleteNotification(notificationId) {
  return request({
    url: `/notifications/${encodeURIComponent(notificationId)}`,
    method: 'DELETE',
    data: {}
  })
}

function deviceClaim(payload) {
  return request({ url: '/device/claim', method: 'POST', data: payload })
}

module.exports = {
  request,
  authWechat,
  getUserMe,
  patchUserMe,
  uploadUserAvatar,
  getDevices,
  bindDevice,
  unbindDevice,
  patchDevice,
  postCommand,
  getCommandStatus,
  getLogs,
  getSchedules,
  createSchedule,
  patchSchedule,
  deleteSchedule,
  postShare,
  getShares,
  otaCheck,
  otaStart,
  getOtaProgress,
  getNotifications,
  patchNotificationRead,
  deleteNotification,
  deviceClaim
}
