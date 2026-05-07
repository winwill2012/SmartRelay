const { getApiBase, isLocalhostApiBase } = require('./config.js')
const auth = require('./auth.js')

function isUnauthorizedText(msg) {
  const s = String(msg || '')
  return /未授权|未登录|unauthorized|not authorized|forbidden|invalid token|token.*(expired|invalid)|401/i.test(
    s
  )
}

function toFriendlyMessage(msg, statusCode) {
  const raw = String(msg || '').trim()
  if (statusCode === 401 || isUnauthorizedText(raw)) {
    return '登录状态已失效，请重新登录'
  }
  if (/timeout|timed out|超时/i.test(raw)) {
    return '请求超时，请稍后重试'
  }
  if (/request:fail|network|fail connect|econn|enotfound|连接失败|网络/i.test(raw)) {
    return '网络连接异常，请检查网络后重试'
  }
  if (/not found|不存在|404/i.test(raw)) {
    return '请求的内容不存在'
  }
  if (/permission|无权限|拒绝|forbidden|denied/i.test(raw)) {
    return '暂无权限执行该操作'
  }
  if (!raw) return '服务暂时不可用，请稍后重试'
  return raw
}

function markUnauthorized(err, statusCode, bodyCode) {
  const unauthorized = statusCode === 401 || bodyCode === 401 || isUnauthorizedText(err && err.message)
  if (unauthorized) {
    err.isUnauthorized = true
    auth.setToken('')
  }
}

/**
 * 从非标准 JSON（如 FastAPI { detail }、网关 HTML）解析可读错误文案，避免出现「错误 undefined」
 */
function parseHttpErrorMessage(body, statusCode) {
  if (body && typeof body.message === 'string' && body.message.trim()) {
    return toFriendlyMessage(body.message.trim(), statusCode)
  }
  const d = body && body.detail
  if (typeof d === 'string' && d.trim()) return toFriendlyMessage(d.trim(), statusCode)
  if (Array.isArray(d) && d.length) {
    const parts = d
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x.msg === 'string') return x.msg
        if (x && typeof x.message === 'string') return x.message
        return ''
      })
      .filter(Boolean)
    if (parts.length) return toFriendlyMessage(parts.join('；'), statusCode)
  }
  if (body && body.code !== undefined && body.code !== null) {
    return toFriendlyMessage('', statusCode)
  }
  if (statusCode && statusCode !== 200) {
    return toFriendlyMessage('', statusCode)
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
            status >= 400 ? toFriendlyMessage('', status) : '响应格式错误，请稍后重试'
          )
          err.httpStatus = status
          markUnauthorized(err, status)
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
          markUnauthorized(err, status, body.code)
          reject(err)
          return
        }
        const err = new Error(parseHttpErrorMessage(body, status))
        if (body.code !== undefined) err.code = body.code
        err.httpStatus = status
        markUnauthorized(err, status, body.code)
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
      return '当前网络无法连接到服务，请确认已切换为可访问的服务器地址'
    }
    return '网络连接异常，请检查网络后重试'
  }
  return toFriendlyMessage(raw, 0) || '网络错误'
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

function getDeviceShares(deviceId) {
  return request({
    url: `/devices/${encodeURIComponent(deviceId)}/shares`,
    method: 'GET'
  })
}

function getShareInvite(shareToken) {
  return request({
    url: `/shares/invite?share_token=${encodeURIComponent(shareToken)}`,
    method: 'GET'
  })
}

function acceptShare(shareToken) {
  return request({
    url: '/shares/accept',
    method: 'POST',
    data: { share_token: shareToken }
  })
}

function rejectShare(shareToken) {
  return request({
    url: '/shares/reject',
    method: 'POST',
    data: { share_token: shareToken }
  })
}

function revokeShare(shareId) {
  return request({
    url: `/shares/${encodeURIComponent(shareId)}`,
    method: 'DELETE'
  })
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

function isUnauthorizedError(err) {
  return !!(err && (err.isUnauthorized || err.httpStatus === 401 || err.code === 401 || isUnauthorizedText(err.message)))
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
  getDeviceShares,
  getShareInvite,
  acceptShare,
  rejectShare,
  revokeShare,
  otaCheck,
  otaStart,
  getOtaProgress,
  getNotifications,
  patchNotificationRead,
  deleteNotification,
  deviceClaim,
  isUnauthorizedError
}
