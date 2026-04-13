/** 管理后台统一时间：YYYY-MM-DD HH:mm:ss（去掉 T、截断微秒） */

export function formatAdminDateTime(input: string | number | null | undefined): string {
  if (input == null || input === '') return '—'
  const s = String(input).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?/)
  if (m) {
    const [, date, hh, mm, ss] = m
    return `${date} ${hh.padStart(2, '0')}:${mm}:${ss}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`
  return s
}

const LOG_SOURCE_CN: Record<string, string> = {
  user: '用户',
  admin: '管理后台',
  schedule: '定时任务',
  system: '系统'
}

export function formatLogSource(source: string | null | undefined): string {
  if (source == null || source === '') return '—'
  return LOG_SOURCE_CN[source] ?? source
}

const LOG_ACTION_CN: Record<string, string> = {
  'command.sent': '指令已下发',
  'command.ack': '设备已确认',
  'schedule.run': '定时任务执行'
}

export function formatLogAction(action: string | null | undefined): string {
  if (action == null || action === '') return '—'
  return LOG_ACTION_CN[action] ?? action
}

function normalizeLogDetail(detail: unknown): Record<string, unknown> | null {
  if (detail == null) return null
  if (typeof detail === 'object' && !Array.isArray(detail)) return detail as Record<string, unknown>
  if (typeof detail === 'string') {
    try {
      const o = JSON.parse(detail) as unknown
      if (typeof o === 'object' && o !== null && !Array.isArray(o)) return o as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

export type LogActionTone =
  | 'relay-on'
  | 'relay-off'
  | 'relay-toggle'
  | 'schedule-on'
  | 'schedule-off'
  | 'schedule-run'
  | 'ack-ok'
  | 'ack-fail'
  | 'pending'
  | 'neutral'

/** 结合 action + detail（payload.type / on 等）生成中文说明与配色档位 */
export function describeLogAction(
  action: string | null | undefined,
  detail: unknown
): { label: string; tone: LogActionTone } {
  const a = action ?? ''
  const d = normalizeLogDetail(detail)

  if (a === 'schedule.run') {
    const sa = d?.action
    if (sa === 'on') return { label: '定时·开机', tone: 'schedule-on' }
    if (sa === 'off') return { label: '定时·关机', tone: 'schedule-off' }
    return { label: '定时任务执行', tone: 'schedule-run' }
  }

  if (a === 'command.ack') {
    const success = d?.success
    if (success === true) return { label: '设备确认·成功', tone: 'ack-ok' }
    if (success === false) return { label: '设备确认·失败', tone: 'ack-fail' }
    return { label: '设备已确认', tone: 'neutral' }
  }

  if (a === 'command.sent') {
    const typ = typeof d?.type === 'string' ? d.type : ''
    const payload =
      d?.payload != null && typeof d.payload === 'object' && !Array.isArray(d.payload)
        ? (d.payload as Record<string, unknown>)
        : null

    if (typ === 'relay.set') {
      if (payload && typeof payload.on === 'boolean') {
        if (payload.on) return { label: '继电器·开机', tone: 'relay-on' }
        return { label: '继电器·关机', tone: 'relay-off' }
      }
      return { label: '继电器·设状态', tone: 'neutral' }
    }
    if (typ === 'relay.toggle') {
      return { label: '继电器·翻转', tone: 'relay-toggle' }
    }
    if (typ === 'schedule.sync' || typ.startsWith('schedule.')) {
      return { label: '定时配置同步', tone: 'schedule-run' }
    }
    if (typ) {
      return { label: `指令：${typ}`, tone: 'pending' }
    }
    return { label: '指令已下发', tone: 'pending' }
  }

  return { label: formatLogAction(a), tone: 'neutral' }
}

/** 表格内标签：class名供 admin-log-action-chip 使用 */
export function logActionChip(action: string | null | undefined, detail: unknown) {
  const { label, tone } = describeLogAction(action, detail)
  return {
    label,
    chipClass: `admin-log-action-chip admin-log-action-chip--${tone}`
  }
}
