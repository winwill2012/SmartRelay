const config = require('./utils/config.js')

App({
  globalData: {
    /**
     * 真机调试：不能用 127.0.0.1（真机会访问手机自己）。请改为电脑局域网 IP，例如：
     *   apiBase: 'http://192.168.1.5:8000/api/v1'
     * 电脑 cmd 执行 ipconfig 查看 IPv4；后端须 uvicorn --host 0.0.0.0 --port 8000；手机与电脑同 WiFi。
     * 上线请改为 HTTPS 域名并在公众平台配置 request 合法域名。
     */
    apiBase: 'http://192.168.1.226:8000/api/v1'
  },
  onLaunch() {
    try {
      const ext = wx.getExtConfigSync ? wx.getExtConfigSync() : {}
      if (ext && ext.apiBase) {
        this.globalData.apiBase = String(ext.apiBase).replace(/\/$/, '')
      }
    } catch (e) {}
  }
})
