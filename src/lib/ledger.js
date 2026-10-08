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


export const defaultEntryForBook = (name = '') => {
  const title = name.trim()
  if (!/(副业|工资|红包|收入|奖金|薪资|兼职|收益|理财|利息|分红)/.test(title)) {
    return { type: 'expense', category: '餐饮' }
  }
  const category = /(工资|薪资)/.test(title) ? '工资'
    : /奖金/.test(title) ? '奖金'
      : /(理财|利息|分红)/.test(title) ? '理财' : '其他'
  return { type: 'income', category }
}
