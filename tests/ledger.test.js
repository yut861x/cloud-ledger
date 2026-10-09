import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryBreakdown, defaultEntryForBook } from '../src/lib/ledger.js'

test('income-like book names start a new entry as income', () => {
  for (const name of ['副业', '我的工资', '红包账本', '额外收入', '兼职记录']) {
    assert.equal(defaultEntryForBook(name).type, 'income', name)
  }
})

test('income category follows the book name when possible', () => {
  assert.deepEqual(defaultEntryForBook('工资账本'), { type: 'income', category: '工资' })
  assert.deepEqual(defaultEntryForBook('年终奖金'), { type: 'income', category: '奖金' })
  assert.deepEqual(defaultEntryForBook('红包账本'), { type: 'income', category: '其他' })
})

test('other books keep the existing expense default', () => {
  assert.deepEqual(defaultEntryForBook('默认账本'), { type: 'expense', category: '餐饮' })
  assert.deepEqual(defaultEntryForBook('旅行日志'), { type: 'expense', category: '餐饮' })
})

test('built-in salary book remains income after renaming', () => {
  assert.deepEqual(defaultEntryForBook('我的固定入账', true), { type: 'income', category: '工资' })
})


test('category breakdown aggregates each transaction type separately', () => {
  const rows = [
    { type: 'expense', category: '餐饮', amount: '25.5' },
    { type: 'income', category: '工资', amount: 300 },
    { type: 'expense', category: '购物', amount: 15 },
    { type: 'expense', category: '餐饮', amount: 9.5 },
    { type: 'income', category: '奖金', amount: 100 },
  ]
  assert.deepEqual(categoryBreakdown(rows, 'expense').map(({ name, amount, percent }) => ({ name, amount, percent })), [
    { name: '餐饮', amount: 35, percent: 70 },
    { name: '购物', amount: 15, percent: 30 },
  ])
  assert.deepEqual(categoryBreakdown(rows, 'income').map(({ name, amount, percent }) => ({ name, amount, percent })), [
    { name: '工资', amount: 300, percent: 75 },
    { name: '奖金', amount: 100, percent: 25 },
  ])
})

test('category breakdown has an empty state for missing or invalid amounts', () => {
  assert.deepEqual(categoryBreakdown([{ type: 'expense', category: '餐饮', amount: 0 }], 'expense'), [])
  assert.deepEqual(categoryBreakdown([], 'income'), [])
})

test('built-in fixed expense book remains expense after renaming', () => {
  assert.deepEqual(defaultEntryForBook('每月房租', false, true), { type: 'expense', category: '其他' })
  assert.deepEqual(defaultEntryForBook('固定收入', false, true), { type: 'expense', category: '其他' })
})
