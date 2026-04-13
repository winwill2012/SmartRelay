/** 与原型 firmware-ota.html 一致：主版本号比较，支持 1.4.3、v1.4.3、1.4.3-beta 等 */

export function parseVersionParts(str: string): number[] | null {
  const s = String(str || '')
    .trim()
    .replace(/^v/i, '')
  if (!s) return null
  const m = s.match(/^(\d+(?:\.\d+)*)/)
  if (!m) return null
  return m[1].split('.').map((x) => {
    const n = parseInt(x, 10)
    return Number.isNaN(n) ? 0 : n
  })
}

export function compareVersionParts(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const va = i < a.length ? a[i] : 0
    const vb = i < b.length ? b[i] : 0
    if (va !== vb) return va - vb
  }
  return 0
}

export function compareVersionStrings(a: string, b: string): number {
  const pa = parseVersionParts(a)
  const pb = parseVersionParts(b)
  if (!pa || !pb) return NaN
  return compareVersionParts(pa, pb)
}

export function getHighestListVersion(versions: string[]): string | null {
  let best: string | null = null
  for (const v of versions) {
    if (!parseVersionParts(v)) continue
    if (best === null || compareVersionStrings(v, best) > 0) best = v
  }
  return best
}

export function validateNewVersionOrder(ver: string, existingVersions: string[]): { ok: boolean; message?: string } {
  const parts = parseVersionParts(ver)
  if (!parts?.length) {
    return { ok: false, message: '版本号格式无效，请使用数字与点分隔，例如 1.4.3。' }
  }
  const highest = getHighestListVersion(existingVersions)
  if (highest === null) return { ok: true }
  const cmp = compareVersionStrings(ver, highest)
  if (Number.isNaN(cmp) || cmp <= 0) {
    return {
      ok: false,
      message: `新版本号必须高于列表中已有最高版本（当前最高：${highest}）。请填写大于 ${highest} 的版本号。`
    }
  }
  return { ok: true }
}

export function releaseNotesToLines(text: string | null | undefined): string[] {
  if (text == null || text === '') return ['暂无该版本的详细说明。']
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  return lines.length ? lines : ['暂无该版本的详细说明。']
}
