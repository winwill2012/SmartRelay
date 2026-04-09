const TOKEN_KEY = 'sr_access_token'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token)
  else wx.removeStorageSync(TOKEN_KEY)
}

function isLoggedIn() {
  return !!getToken()
}

module.exports = {
  TOKEN_KEY,
  getToken,
  setToken,
  isLoggedIn
}
