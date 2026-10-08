import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, holidayForDate } from '../src/lib/calendar.js'

test('official holidays and makeup workdays are marked', () => {
  assert.deepEqual(holidayForDate('2026-10-01'), { kind: 'holiday', label: '国庆节' })
  assert.deepEqual(holidayForDate('2026-10-10'), { kind: 'workday', label: '调休上班' })
  assert.deepEqual(holidayForDate('2025-01-26'), { kind: 'workday', label: '调休上班' })
  assert.equal(holidayForDate('2027-10-01'), null)
})

test('calendar uses Monday first and nets income minus expense per day', () => {
  const days = calendarDays('2026-10', [
    { occurred_on: '2026-10-08', type: 'income', amount: 120 },
    { occurred_on: '2026-10-08', type: 'expense', amount: 20 },
    { occurred_on: '2026-10-09', type: 'expense', amount: 35 },
  ])
  assert.equal(days[0], null)
  assert.equal(days[3].date, '2026-10-01')
  assert.equal(days.find((day) => day?.date === '2026-10-08').net, 100)
  assert.equal(days.find((day) => day?.date === '2026-10-09').net, -35)
  assert.equal(days.find((day) => day?.date === '2026-10-11').net, 0)
})
