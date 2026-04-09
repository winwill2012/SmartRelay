const api = require('../../utils/api.js')

const ACTION_ZH = {
  'command.sent': '指令下发',
  'schedule.run': '定时执行',
  'command.ack': '设备反馈',
  'ota.progress': '固件更新'
}

function cmdTypeZh(t) {
  const m = {
    'relay.set': '继电器',
    'relay.toggle': '继电器',
    'schedule.sync': '定时任务',
    ping: '连通测试',
    'ota.start': '固件更新'
  }
  return m[t] || t || ''
}

function formatLogTime(iso) {
  if (!iso) return ''
  const s = String(iso).replace('Z', '').replace(/\.\d{3}$/, '')
  const parts = s.split('T')
  if (parts.length === 2) {
    const [d, t] = parts
    return `${d} ${t.slice(0, 5)}`
  }
  if (s.length >= 16 && s[10] === ' ') return s.slice(0, 16)
  return s
}

function formatLogDetail(action, detail) {
  if (detail == null || detail === '') return ''
  if (typeof detail === 'string') return detail
  if (typeof detail !== 'object') return String(detail)

  if (action === 'schedule.run') {
    const sid = detail.schedule_id
    const a = detail.action === 'on' ? '开' : '关'
    const tag = sid != null && sid !== '' ? `#${sid} ` : ''
    return `${tag}${a}`
  }

  if (action === 'command.sent') {
    const ty = cmdTypeZh(detail.type)
    const p = detail.payload || {}
    let extra = ''
    if (detail.type === 'relay.set' && typeof p.on === 'boolean') {
      extra = p.on ? '（开）' : '（关）'
    }
    if (detail.type === 'schedule.sync') return '「定时任务」已同步到设备'
    if (ty) return `「${ty}」已发送${extra}`
    return `已发送${extra}`
  }

  if (action === 'command.ack') {
    if (detail.success === true) return '已确认执行'
    if (detail.success === false) {
      const msg = detail.error_message || detail.error_code || ''
      return msg ? `失败：${msg}` : '执行失败'
    }
    return JSON.stringify(detail)
  }

  if (action === 'ota.progress') {
    const pct = detail.percent != null ? `${detail.percent}%` : ''
    const st = detail.status || detail.stage || ''
    return [st, pct].filter(Boolean).join(' · ') || JSON.stringify(detail)
  }

  try {
    return JSON.stringify(detail)
  } catch (e) {
    return String(detail)
  }
}

function mapLogItem(x) {
  const action = x.action || ''
  return {
    id: x.id,
    actionLabel: ACTION_ZH[action] || action || '操作',
    detailText: formatLogDetail(action, x.detail),
    timeText: formatLogTime(x.created_at)
  }
}

Page({
  data: {
    device_id: '',
    loading: true,
    error: '',
    list: [],
    page: 1,
    hasMore: true
  },

  onLoad(q) {
    this.setData({ device_id: q.device_id || '' })
  },

  onShow() {
    this.setData({ page: 1, list: [], hasMore: true })
    if (this.data.device_id) {
      this.load(true)
    }
  },

  async load(reset) {
    if (!this.data.device_id) return
    const page = reset ? 1 : this.data.page
    if (reset) this.setData({ loading: true, error: '' })
    try {
      const data = await api.getLogs(this.data.device_id, {
        page,
        page_size: 20
      })
      const arr = Array.isArray(data) ? data : data.list || data.items || []
      const mapped = arr.map(mapLogItem)
      const list = reset ? mapped : this.data.list.concat(mapped)
      const hasMore = arr.length >= 20
      this.setData({
        list,
        page: page + 1,
        hasMore,
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false, error: e.message || '加载失败' })
    }
  },

  loadMore() {
    if (!this.data.hasMore) return
    this.load(false)
  }
})
