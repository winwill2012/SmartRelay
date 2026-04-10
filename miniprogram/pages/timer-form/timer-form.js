const api = require('../../utils/api.js')
const feedback = require('../../utils/feedback.js')

const REPEATS = [
  { id: 'once', label: '一次' },
  { id: 'daily', label: '每天' },
  { id: 'weekly', label: '每周' },
  { id: 'monthly', label: '每月' }
]

function buildWeekdays() {
  return [
    { value: 1, label: '周一', on: false },
    { value: 2, label: '周二', on: false },
    { value: 3, label: '周三', on: false },
    { value: 4, label: '周四', on: false },
    { value: 5, label: '周五', on: false },
    { value: 6, label: '周六', on: false },
    { value: 0, label: '周日', on: false }
  ]
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i))

function buildMonthdays(selected) {
  const set = {}
  ;(selected || []).forEach((d) => {
    set[d] = true
  })
  const out = []
  for (let d = 1; d <= 31; d++) {
    out.push({ d, on: !!set[d] })
  }
  return out
}

Page({
  data: {
    device_id: '',
    schedule_id: '',
    name: '',
    repeat: 'once',
    repeats: REPEATS,
    weekdays: buildWeekdays(),
    monthdays: buildMonthdays([]),
    time_local: '22:00',
    hours: HOURS,
    minutes: MINUTES,
    showTimeModal: false,
    timePickerValue: [22, 0],
    showActionModal: false,
    actionPickerValue: [0],
    actionLabels: ['关闭', '打开'],
    actionIndex: 0,
    saving: false
  },

  onLoad(q) {
    this.setData({
      device_id: q.device_id || '',
      schedule_id: q.schedule_id || ''
    })
    if (q.schedule_id) {
      wx.setNavigationBarTitle({ title: '编辑定时' })
      this.loadOne(q.schedule_id)
    }
  },

  async loadOne(scheduleId) {
    try {
      const data = await api.getSchedules(this.data.device_id)
      const arr = Array.isArray(data) ? data : data.list || data.items || []
      const s = arr.find(
        (x) => String(x.id || x.schedule_id) === String(scheduleId)
      )
      if (!s) return
      const actionIndex = s.action === 'on' ? 1 : 0
      const repeat = s.repeat_type || 'once'
      const weekdays = buildWeekdays()
      ;(s.weekdays || []).forEach((v) => {
        const row = weekdays.find((w) => w.value === v)
        if (row) row.on = true
      })
      const tl = (s.time_local || '08:00').slice(0, 5)
      this.setData({
        name: s.name || '',
        repeat,
        weekdays,
        monthdays: buildMonthdays(s.monthdays || []),
        time_local: tl,
        actionIndex
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onRepeat(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ repeat: id })
  },

  onWeekTap(e) {
    const v = e.currentTarget.dataset.v
    const weekdays = this.data.weekdays.map((w) =>
      w.value === v ? { ...w, on: !w.on } : w
    )
    this.setData({ weekdays })
  },

  onMonthTap(e) {
    const d = e.currentTarget.dataset.d
    const monthdays = this.data.monthdays.map((m) =>
      m.d === d ? { ...m, on: !m.on } : m
    )
    this.setData({ monthdays })
  },

  noop() {},

  openTimePicker() {
    feedback.uiTapFeedback()
    this.setData({ showActionModal: false })
    const parts = (this.data.time_local || '08:00').split(':')
    let h = parseInt(parts[0], 10)
    let m = parseInt(parts[1], 10)
    if (Number.isNaN(h) || h < 0 || h > 23) h = 8
    if (Number.isNaN(m) || m < 0 || m > 59) m = 0
    this.setData({
      showTimeModal: true,
      timePickerValue: [h, m]
    })
  },

  onTimePickerChange(e) {
    feedback.playScrollTick()
    this.setData({ timePickerValue: e.detail.value })
  },

  onTimeModalCancel() {
    this.setData({ showTimeModal: false })
  },

  onTimeModalConfirm() {
    const [hi, mi] = this.data.timePickerValue
    const h = HOURS[hi] || '00'
    const m = MINUTES[mi] || '00'
    feedback.uiTapFeedback()
    this.setData({
      time_local: `${h}:${m}`,
      showTimeModal: false
    })
  },

  openActionPicker() {
    feedback.uiTapFeedback()
    this.setData({ showTimeModal: false })
    this.setData({
      showActionModal: true,
      actionPickerValue: [this.data.actionIndex]
    })
  },

  onActionPickerChange(e) {
    feedback.playScrollTick()
    this.setData({ actionPickerValue: e.detail.value })
  },

  onActionModalCancel() {
    this.setData({ showActionModal: false })
  },

  onActionModalConfirm() {
    const idx = this.data.actionPickerValue[0]
    const actionIndex =
      idx === 0 || idx === 1 ? idx : this.data.actionIndex
    feedback.uiTapFeedback()
    this.setData({
      actionIndex,
      showActionModal: false
    })
  },

  async onSave() {
    const {
      device_id,
      schedule_id,
      name,
      repeat,
      weekdays,
      monthdays,
      time_local,
      actionIndex
    } = this.data
    if (!device_id) {
      wx.showToast({ title: '缺少设备', icon: 'none' })
      return
    }
    const action = actionIndex === 1 ? 'on' : 'off'
    const payload = {
      name: name || undefined,
      repeat_type: repeat,
      time_local,
      action,
      enabled: true
    }
    if (repeat === 'weekly') {
      payload.weekdays = weekdays.filter((w) => w.on).map((w) => w.value)
      if (payload.weekdays.length === 0) {
        wx.showToast({ title: '请选择星期', icon: 'none' })
        return
      }
    } else if (repeat === 'monthly') {
      payload.monthdays = monthdays.filter((m) => m.on).map((m) => m.d)
      if (payload.monthdays.length === 0) {
        wx.showToast({ title: '请选择日期', icon: 'none' })
        return
      }
    } else {
      payload.weekdays = null
      payload.monthdays = null
    }

    this.setData({ saving: true })
    try {
      if (schedule_id) {
        await api.patchSchedule(schedule_id, payload)
      } else {
        await api.createSchedule(device_id, payload)
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
