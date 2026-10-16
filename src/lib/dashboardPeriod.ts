export type DashboardPeriod = { from: string; to: string }
export type DashboardPreset = 'all' | 'year' | 'previousYear' | 'sixMonths' | 'threeMonths' | 'month' | 'custom'
const key = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
export function dashboardDate(value: string | null | undefined): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function dashboardPeriod(preset: DashboardPreset, now = new Date()): DashboardPeriod {
  const today = dashboardDate(now.toISOString()), [year, month, day] = today.split('-').map(Number)
  if (preset === 'year') return { from: key(year, 0, 1), to: key(year, 11, 31) }
  if (preset === 'previousYear') return { from: key(year - 1, 0, 1), to: key(year - 1, 11, 31) }
  if (preset === 'month') return { from: key(year, month - 1, 1), to: key(year, month - 1, new Date(Date.UTC(year, month, 0)).getUTCDate()) }
  if (preset === 'sixMonths' || preset === 'threeMonths') {
    const start = new Date(Date.UTC(year, month - 1 - (preset === 'sixMonths' ? 6 : 3), 1))
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    return { from: key(start.getUTCFullYear(), start.getUTCMonth(), Math.min(day, lastDay)), to: today }
  }
  return { from: '', to: '' }
}
export const hasDashboardPeriod = (period: DashboardPeriod) => !!(period.from || period.to)
export const validDashboardPeriod = (period: DashboardPeriod) => !period.from || !period.to || period.from <= period.to
export function inDashboardPeriod(value: string | null | undefined, period: DashboardPeriod) {
  if (!validDashboardPeriod(period)) return false
  if (!hasDashboardPeriod(period)) return true
  const date = dashboardDate(value)
  return !!date && (!period.from || date >= period.from) && (!period.to || date <= period.to)
}

