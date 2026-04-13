/** SVG 折线图路径；可选 labels 用于悬停提示 */

export type LineVertex = { x: number; y: number; value: number; label: string }

export function buildLineChart(points: number[], labels?: string[]) {
  const pts = points.length ? points : [0]
  const w = 400
  const h = 120
  const pad = 16
  const bw = w - pad * 2
  const bh = h - pad * 2
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const r = max - min || 1
  const d = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1 || 1)) * bw
    const y = pad + bh - ((v - min) / r) * bh
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
  return { pathD: path, fillD: fillPath, gridYs, w, pad, vertices }
}

export function barHeights(vals: number[], maxHint?: number) {
  const max = maxHint ?? Math.max(...vals, 1)
  const barMaxPx = 132
  return vals.map((v) => Math.max(10, Math.round((v / max) * barMaxPx)))
}
