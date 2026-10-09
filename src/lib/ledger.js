export const categories = {
  expense: [
    { name: '餐饮', icon: 'UtensilsCrossed', color: '#f3a46b' },
    { name: '购物', icon: 'ShoppingBag', color: '#aa9be5' },
    { name: '交通', icon: 'BusFront', color: '#84b9d1' },
    { name: '居住', icon: 'House', color: '#d8ad83' },
    { name: '娱乐', icon: 'Gamepad2', color: '#d991ad' },
    { name: '健康', icon: 'HeartPulse', color: '#8fc4a9' },
    { name: '其他', icon: 'MoreHorizontal', color: '#aab0b4' },
  ],
  income: [
    { name: '工资', icon: 'BriefcaseBusiness', color: '#7eb99f' },
    { name: '奖金', icon: 'Gift', color: '#e5ad75' },
    { name: '理财', icon: 'TrendingUp', color: '#8ea8d8' },
    { name: '其他', icon: 'MoreHorizontal', color: '#aab0b4' },
  ],
}

export const categoryMeta = (type, name) =>
  categories[type]?.find((item) => item.name === name) || categories[type]?.at(-1) || categories.expense.at(-1)


export const bookCategoryLabels = [
  { type: 'dynamic_expense', label: '动态支出' },
  { type: 'fixed_expense', label: '固定支出' },
  { type: 'dynamic_income', label: '动态收入' },
  { type: 'fixed_income', label: '固定收入' },
]

export const bookCategory = (book) => {
  if (book?.is_salary) return 'fixed_income'
  if (book?.is_fixed_expense) return 'fixed_expense'
  if (book?.is_default) return 'dynamic_expense'
  if (bookCategoryLabels.some((item) => item.type === book?.book_type)) return book.book_type
  return defaultEntryForBook(book?.name).type === 'income' ? 'dynamic_income' : 'dynamic_expense'
}

export function categoryBreakdown(rows, type) {
  const totals = new Map()
  for (const row of rows) {
    if (row.type !== type) continue
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    totals.set(row.category, (totals.get(row.category) || 0) + amount)
  }
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)
  return [...totals].map(([name, amount]) => ({
    name, amount, percent: amount / total * 100, color: categoryMeta(type, name).color,
  })).sort((a, b) => b.amount - a.amount)
}

export const money = (value) => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency: 'CNY', minimumFractionDigits: 2,
}).format(Number(value) || 0)

export const localDate = (date = new Date()) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}

export const monthTitle = (month) => {
  const [year, number] = month.split('-')
  return `${year} 年 ${Number(number)} 月`
}

export const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`


export const defaultEntryForBook = (name = '', isSalary = false, isFixedExpense = false, bookType = null) => {
  if (isFixedExpense) return { type: 'expense', category: '其他' }
  if (isSalary) return { type: 'income', category: '工资' }
  if (bookType === 'fixed_expense') return { type: 'expense', category: '其他' }
  if (!isSalary && bookType === 'dynamic_expense') return { type: 'expense', category: '餐饮' }
  const title = name.trim()
  if (!isSalary && bookType !== 'dynamic_income' && bookType !== 'fixed_income' && !/(副业|工资|红包|收入|奖金|薪资|兼职|收益|理财|利息|分红)/.test(title)) {
    return { type: 'expense', category: '餐饮' }
  }
  const category = isSalary || /(工资|薪资)/.test(title) ? '工资'
    : /奖金/.test(title) ? '奖金'
      : /(理财|利息|分红)/.test(title) ? '理财' : '其他'
  return { type: 'income', category }
}
