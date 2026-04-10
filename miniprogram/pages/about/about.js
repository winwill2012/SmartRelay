const { getMiniProgramVersion, DEFAULT_VERSION } = require('../../utils/app-version.js')

Page({
  data: {
    version: DEFAULT_VERSION
  },

  onLoad() {
    const v = getMiniProgramVersion()
    this.setData({ version: v || DEFAULT_VERSION })
  }
})
