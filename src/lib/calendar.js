// 国务院办公厅公布的放假调休安排（不推测尚未公布的年份）。
export const holidaySources = {
  2025: 'https://www.gov.cn/gongbao/2024/issue_11726/material/gwygb202433.pdf',
  2026: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
}

const plans = {
  2025: {
    holidays: [['01-01', '01-01', '元旦'], ['01-28', '02-04', '春节'], ['04-04', '04-06', '清明节'], ['05-01', '05-05', '劳动节'], ['05-31', '06-02', '端午节'], ['10-01', '10-08', '国庆节·中秋节']],
    workdays: ['01-26', '02-08', '04-27', '09-28', '10-11'],
  },
  2026: {
    holidays: [['01-01', '01-03', '元旦'], ['02-15', '02-23', '春节'], ['04-04', '04-06', '清明节'], ['05-01', '05-05', '劳动节'], ['06-19', '06-21', '端午节'], ['09-25', '09-27', '中秋节'], ['10-01', '10-07', '国庆节']],
    workdays: ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10'],
  },
}

export function holidayForDate(date) {
  const year = Number(date.slice(0, 4))
  const plan = plans[year]
  if (!plan) return null
  const day = date.slice(5)
  if (plan.workdays.includes(day)) return { kind: 'workday', label: '调休上班' }
  const holiday = plan.holidays.find(([start, end]) => day >= start && day <= end)
  return holiday ? { kind: 'holiday', label: holiday[2] } : null
}

export function calendarDays(month, rows = []) {
  const [year, number] = month.split('-').map(Number)
  const count = new Date(year, number, 0).getDate()
  const offset = (new Date(year, number - 1, 1).getDay() + 6) % 7
  const totals = new Map()
  for (const row of rows) {
    const current = totals.get(row.occurred_on) || { net: 0, count: 0 }
    current.net += (row.type === 'income' ? 1 : -1) * Number(row.amount)
    current.count++
    totals.set(row.occurred_on, current)
  }
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`
      return { date, day: index + 1, ...holidayForDate(date), ...(totals.get(date) || { net: 0, count: 0 }) }
    }),
  ]
}
