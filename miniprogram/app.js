const { getBaseURL } = require('./utils/config.js')

App({
  globalData: {
    baseURL: '',
    user: null
  },
  onLaunch() {
    this.globalData.baseURL = getBaseURL()
  }
})
