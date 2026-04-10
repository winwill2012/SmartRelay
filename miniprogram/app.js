App({
  globalData: {
    /**
     * 真机调试：不能用 127.0.0.1（真机会访问手机自己）。请改为电脑局域网 IP，例如：
     *   apiBase: 'http://192.168.1.5:8000/api/v1'
     * 电脑 cmd 执行 ipconfig 查看 IPv4；后端须 uvicorn --host 0.0.0.0 --port 8000；手机与电脑同 WiFi。
     * 生产环境：HTTPS + 微信公众平台 request 合法域名 iot.welinklab.com。
     */
    apiBase: 'https://iot.welinklab.com/smart-relay/api/v1'
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
