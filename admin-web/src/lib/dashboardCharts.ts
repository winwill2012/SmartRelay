/** SVG 折线图路径；可选 labels 用于悬停提示 */

export type LineVertex = { x: number; y: number; value: number; label: string }

export type LineXLabel = { x: number; y: number; text: string }

export type LineChartOptions = {
  /** Y 轴下限；在线设备等计数建议固定 0 */
  yMin?: number
  /** Y 轴上限；建议 ≥ 设备总数，避免各点数值相同时 min=max 全压在底边且折线不可见 */
  yMax?: number
  /** 横轴最多保留约几条文字，超出则隔项显示，避免「本月」等长序列重叠 */
  maxAxisLabels?: number
}

/** 缩短横轴展示：MM/DD(一) → MM/DD（悬停仍用完整 label） */
export function abbreviateAxisLabel(text: string): string {
  if (!text) return ''
  const m = text.match(/^(\d{1,2}\/\d{1,2})\([一二三四五六日]\)$/)
  if (m) return m[1]
  return text
}

/** 与数据点等长数组；不展示的槽位为空串，便于与柱宽、折线点对齐 */
export function sparseAxisLabels(labels: string[], maxVisible = 11): string[] {
  const n = labels.length
  if (n === 0) return []
  if (n <= maxVisible) return [...labels]
  const step = Math.ceil(n / maxVisible)
  const out = labels.map(() => '')
  for (let i = 0; i < n; i += step) {
    out[i] = labels[i]
  }
  out[0] = labels[0]
  out[n - 1] = labels[n - 1]
  return out
}

export function buildAxisDisplayLabels(
  labels: string[] | undefined,
  pointCount: number,
  maxVisible = 11
): string[] {
  const raw =
    labels && labels.length === pointCount ? labels : Array.from({ length: pointCount }, (_, i) => labels?.[i] ?? '')
  const sparse = sparseAxisLabels(raw, maxVisible)
  return sparse.map((t) => (t ? abbreviateAxisLabel(t) : ''))
}

export function buildLineChart(points: number[], labels?: string[], options?: LineChartOptions) {
  const pts = points.length ? points : [0]
  const w = 400
  const h = 120
  const pad = 16
  const bw = w - pad * 2
  const bh = h - pad * 2
  const dataMin = Math.min(...pts)
  const dataMax = Math.max(...pts)
  let minY = options?.yMin !== undefined ? options.yMin : dataMin
  let maxY = options?.yMax !== undefined ? options.yMax : dataMax
  if (options?.yMin === 0) {
    minY = 0
  }
  if (!Number.isFinite(minY)) minY = 0
  if (!Number.isFinite(maxY)) maxY = 1
  if (maxY <= minY) {
    maxY = minY + 1
  }
  const span = maxY - minY
  const d = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1 || 1)) * bw
    const clamped = Math.min(Math.max(v, minY), maxY)
    const y = pad + bh - ((clamped - minY) / span) * bh
    return [x, y] as const
  })
  const path = 'M ' + d.map((p) => `${p[0]} ${p[1]}`).join(' L ')
  const last = d[d.length - 1]
  const first = d[0]
  const fillPath =
    path + ` L ${last[0]} ${pad + bh} L ${first[0]} ${pad + bh} Z`
  const gridYs: number[] = []
  for (let g = 0; g <= 4; g++) {
    gridYs.push(pad + (g / 4) * bh)
  }
  const vertices: LineVertex[] = pts.map((v, i) => ({
    x: d[i][0],
    y: d[i][1],
    value: v,
    label: labels?.[i] ?? ''
  }))
  /** 横轴刻度：稀疏 + 缩写，与柱图底部展示策略一致 */
  const maxAxis = options?.maxAxisLabels ?? 11
  const axisDisplay = buildAxisDisplayLabels(labels, pts.length, maxAxis)
  const xLabelY = pad + bh + 12
  const xLabels: LineXLabel[] = pts.map((_, i) => ({
    x: d[i][0],
    y: xLabelY,
    text: axisDisplay[i] ?? ''
  }))
  /** 点很多时略旋转横轴字，进一步防重叠 */
  const xLabelTilt = pts.length > 12
  return { pathD: path, fillD: fillPath, gridYs, w, pad, vertices, xLabels, xLabelTilt }
}

export function barHeights(vals: number[], maxHint?: number, barMaxPx = 200) {
  const max = maxHint ?? Math.max(...vals, 1)
  return vals.map((v) => Math.max(12, Math.round((v / max) * barMaxPx)))
}
