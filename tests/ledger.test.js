import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultEntryForBook } from '../src/lib/ledger.js'

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
