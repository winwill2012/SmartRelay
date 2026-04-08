const { getBaseURL } = require('./config.js')

/**
 * 统一 HTTP：Bearer、§9 code 判断
 * 成功：resolve(data)；失败：reject({ code, message, raw })
 */
function request(options) {
  const { url, method = 'GET', data, header = {} } = options
  const token = wx.getStorageSync('token') || ''
  const baseURL = getBaseURL()

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseURL}${url}`,
      method,
      data: data || {},
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...header
      },
      success(res) {
        const status = res.statusCode
        const body = res.data || {}
        if (status === 401 || status === 403) {
          wx.removeStorageSync('token')
          reject({ code: 40101, message: '登录已失效', raw: body })
          return
        }
        if (typeof body.code !== 'number') {
          reject({ code: -1, message: '响应格式异常', raw: body })
          return
        }
        if (body.code === 0) {
          resolve(body.data)
          return
        }
        reject({
          code: body.code,
          message: body.message || '请求失败',
          raw: body
        })
      },
      fail(err) {
        let msg = err.errMsg || '网络错误'
        if (/not in domain list|不在以下 request 合法域名|url not in domain list/i.test(msg)) {
          msg =
            '请求域名未通过校验：真机/体验版需在「微信公众平台 → 开发管理 → 开发设置 → 服务器域名」配置 request 合法域名（须 HTTPS，不支持 IP）；开发者工具可勾选「不校验合法域名」。手机无法访问 127.0.0.1，请在「我的」页填写已备案域名与 HTTPS 端口。'
        } else if (/127\.0\.0\.1|localhost/i.test(`${baseURL}`) && /fail connect/i.test(msg)) {
          msg = '无法连接本机地址：真机请使用电脑局域网 IP 或线上 HTTPS API，并在「我的」页保存。'
        }
        reject({ code: -2, message: msg, raw: err })
      }
    })
  })
}

module.exports = { request }
