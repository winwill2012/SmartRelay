Component({
  data: {
    selected: 0,
    color: '#8a8f99',
    selectedColor: '#2563eb',
    list: [
      {
        pagePath: '/pages/devices/devices',
        text: '首页',
        iconPath: '/assets/tab-home.png',
        selectedIconPath: '/assets/tab-home-active.png'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        iconPath: '/assets/tab-mine.png',
        selectedIconPath: '/assets/tab-mine-active.png'
      }
    ]
  },
  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
      this.setData({ selected: index })
    }
  }
})
