const api = require('../../utils/api.js')

function summarize(s) {
  const t = s.time_local || s.time || ''
  const act = s.action === 'on' ? '打开' : '关闭'
  let rep = ''
  if (s.repeat_type === 'once') rep = '一次'
  else if (s.repeat_type === 'daily') rep = '每天'
  else if (s.repeat_type === 'weekly') {
    const w = (s.weekdays || []).map(dayLabel).join('、')
    rep = `每周 ${w || '—'}`
  } else if (s.repeat_type === 'monthly') {
    const m = (s.monthdays || []).join('、')
    rep = `每月 ${m || '—'} 日`
  }
  return `${rep} · ${t} · ${act}`
}

function dayLabel(d) {
  const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return map[d] || d
}

Page({
  data: {
    device_id: '',
    tz: 'Asia/Shanghai',
    loading: true,
    error: '',
    list: []
  },

  onLoad(q) {
    this.setData({ device_id: q.device_id || '' })
  },

  onShow() {
    if (this.data.device_id) {
      this.load()
    }
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.getSchedules(this.data.device_id)
      const arr = Array.isArray(data) ? data : data.list || data.items || []
      const list = arr.map((s) => {
        const id = s.id || s.schedule_id
        return Object.assign({}, s, {
          id: String(id),
          summary: summarize(s)
        })
      })
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ loading: false, error: e.message || '加载失败', list: [] })
    }
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id
    const enabled = e.detail.value
    try {
      await api.patchSchedule(id, { enabled })
      const list = this.data.list.map((row) =>
        row.id === id ? { ...row, enabled } : row
      )
      this.setData({ list })
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' })
      this.load()
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除定时',
      content: '确认删除该定时任务？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.deleteSchedule(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
