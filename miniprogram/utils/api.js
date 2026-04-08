const { request } = require('./request.js')

function authWechat(code) {
  return request({
    url: '/api/v1/auth/wechat',
    method: 'POST',
    data: { code }
  })
}

function getMe() {
  return request({ url: '/api/v1/me', method: 'GET' })
}

function getDevices() {
  return request({ url: '/api/v1/devices', method: 'GET' })
}

function bindDevice(payload) {
  return request({
    url: '/api/v1/devices/bind',
    method: 'POST',
    data: payload
  })
}

function unbindDevice(deviceId) {
  return request({
    url: '/api/v1/devices/unbind',
    method: 'POST',
    data: { device_id: deviceId }
  })
}

function patchDevice(deviceId, data) {
  return request({
    url: `/api/v1/devices/${deviceId}`,
    method: 'PATCH',
    data
  })
}

function postCommand(deviceId, on) {
  return request({
    url: `/api/v1/devices/${deviceId}/command`,
    method: 'POST',
    data: { on }
  })
}

function getCommandStatus(deviceId, cmdId) {
  return request({
    url: `/api/v1/devices/${deviceId}/commands/${cmdId}`,
    method: 'GET'
  })
}

function getLogs(deviceId, query) {
  const q = query || {}
  const parts = []
  if (q.page != null) parts.push(`page=${encodeURIComponent(q.page)}`)
  if (q.page_size != null) parts.push(`page_size=${encodeURIComponent(q.page_size)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request({
    url: `/api/v1/devices/${deviceId}/logs${qs}`,
    method: 'GET'
  })
}

function getSchedules(deviceId) {
  return request({
    url: `/api/v1/devices/${deviceId}/schedules`,
    method: 'GET'
  })
}

function postSchedule(deviceId, data) {
  return request({
    url: `/api/v1/devices/${deviceId}/schedules`,
    method: 'POST',
    data
  })
}

function patchSchedule(deviceId, scheduleId, data) {
  return request({
    url: `/api/v1/devices/${deviceId}/schedules/${scheduleId}`,
    method: 'PATCH',
    data
  })
}

function deleteSchedule(deviceId, scheduleId) {
  return request({
    url: `/api/v1/devices/${deviceId}/schedules/${scheduleId}`,
    method: 'DELETE'
  })
}

module.exports = {
  authWechat,
  getMe,
  getDevices,
  bindDevice,
  unbindDevice,
  patchDevice,
  postCommand,
  getCommandStatus,
  getLogs,
  getSchedules,
  postSchedule,
  patchSchedule,
  deleteSchedule
}
