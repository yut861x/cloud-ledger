<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BriefcaseBusiness,
  BusFront, CalendarDays, Check, ChevronDown, CircleHelp, Download, Gamepad2,
  Gift, HeartPulse, House, LayoutDashboard, LogOut, Menu, MoreHorizontal,
  Pencil, Plus, Search, Settings2, ShoppingBag, Trash2, TrendingUp,
  UtensilsCrossed, WalletCards, X,
} from '@lucide/vue'
import { supabase, isConfigured } from './lib/supabase'
import { categories, categoryMeta, csvCell, localDate, money, monthTitle } from './lib/ledger'

const icons = { UtensilsCrossed, ShoppingBag, BusFront, House, Gamepad2, HeartPulse, MoreHorizontal, BriefcaseBusiness, Gift, TrendingUp }
const iconFor = (type, category) => icons[categoryMeta(type, category).icon] || MoreHorizontal

const session = ref(null)
const initializing = ref(true)
const authMode = ref('login')
const email = ref('')
const password = ref('')
const authBusy = ref(false)
const authNotice = ref('')
const authError = ref('')
const rows = ref([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const activeView = ref('overview')
const mobileNav = ref(false)
const month = ref(localDate().slice(0, 7))
const filter = ref('all')
const search = ref('')
const modalOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = ref(emptyForm())
let authSubscription
let requestId = 0

function emptyForm() {
  return { id: null, type: 'expense', amount: '', category: '餐饮', occurred_on: localDate(), note: '' }
}

const monthStart = computed(() => `${month.value}-01`)
const nextMonth = computed(() => {
  const [year, number] = month.value.split('-').map(Number)
  return `${year + (number === 12 ? 1 : 0)}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01`
})
const income = computed(() => rows.value.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0))
const expense = computed(() => rows.value.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0))
const balance = computed(() => income.value - expense.value)
const filteredRows = computed(() => rows.value.filter((item) => {
  const matchesType = filter.value === 'all' || item.type === filter.value
  const query = search.value.trim().toLowerCase()
  return matchesType && (!query || `${item.category} ${item.note || ''} ${item.amount}`.toLowerCase().includes(query))
}))
const expenseGroups = computed(() => {
  const totals = new Map()
  rows.value.filter((item) => item.type === 'expense').forEach((item) => {
    totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount))
  })
  return [...totals].map(([name, amount]) => ({ name, amount, percent: expense.value ? amount / expense.value * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
})
const recentRows = computed(() => rows.value.slice(0, 5))
const listRows = computed(() => activeView.value === 'overview' ? recentRows.value : filteredRows.value)

onMounted(async () => {
  if (!supabase) { initializing.value = false; return }
  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) authError.value = sessionError.message
  session.value = data.session
  initializing.value = false
  const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
    const oldUser = session.value?.user?.id
    session.value = nextSession
    if (oldUser !== nextSession?.user?.id) rows.value = []
  })
  authSubscription = listener.subscription
})
onUnmounted(() => authSubscription?.unsubscribe())
watch([() => session.value?.user?.id, month], () => { if (session.value?.user) loadRows() }, { immediate: true })

async function loadRows() {
  if (!session.value?.user || !supabase) return
  const currentRequest = ++requestId
  loading.value = true
  error.value = ''
  const { data, error: queryError } = await supabase.from('transactions')
    .select('id,type,amount,category,note,occurred_on,created_at')
    .gte('occurred_on', monthStart.value).lt('occurred_on', nextMonth.value)
    .order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
  if (currentRequest !== requestId) return
  loading.value = false
  if (queryError) { error.value = `读取账目失败：${queryError.message}`; return }
  rows.value = data || []
}

async function submitAuth() {
  authError.value = ''
  authNotice.value = ''
  if (!email.value.trim() || !password.value) { authError.value = '请输入邮箱和密码。'; return }
  authBusy.value = true
  try {
    const credentials = { email: email.value.trim(), password: password.value }
    const { data, error: resultError } = authMode.value === 'login'
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
    if (resultError) throw resultError
    if (authMode.value === 'register' && !data.session) authNotice.value = '注册邮件已发送，请打开邮箱完成验证后登录。'
  } catch (err) {
    authError.value = err.message || '操作失败，请稍后重试。'
  } finally { authBusy.value = false }
}

async function logout() {
  const { error: signOutError } = await supabase.auth.signOut()
  if (signOutError) error.value = `退出失败：${signOutError.message}`
}

function changeMonth(step) {
  const [year, number] = month.value.split('-').map(Number)
  const date = new Date(year, number - 1 + step, 1)
  month.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function openCreate() {
  form.value = { ...emptyForm(), occurred_on: month.value === localDate().slice(0, 7) ? localDate() : `${month.value}-01` }
  formError.value = ''
  modalOpen.value = true
}
function openEdit(row) {
  form.value = { id: row.id, type: row.type, amount: String(row.amount), category: row.category, occurred_on: row.occurred_on, note: row.note || '' }
  formError.value = ''
  modalOpen.value = true
}
function changeFormType(type) {
  form.value.type = type
  form.value.category = categories[type][0].name
}

async function saveRow() {
  formError.value = ''
  const amount = Number(form.value.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || !/^\d+(\.\d{1,2})?$/.test(String(form.value.amount))) {
    formError.value = '金额须大于 0，最多两位小数。'; return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.value.occurred_on) || Number.isNaN(Date.parse(form.value.occurred_on))) {
    formError.value = '请选择有效日期。'; return
  }
  if (!categories[form.value.type].some((item) => item.name === form.value.category)) {
    formError.value = '请选择分类。'; return
  }
  saving.value = true
  const payload = {
    type: form.value.type, amount: amount.toFixed(2), category: form.value.category,
    occurred_on: form.value.occurred_on, note: form.value.note.trim() || null,
  }
  const result = form.value.id
    ? await supabase.from('transactions').update(payload).eq('id', form.value.id)
    : await supabase.from('transactions').insert({ ...payload, user_id: session.value.user.id })
  saving.value = false
  if (result.error) { formError.value = `保存失败：${result.error.message}`; return }
  modalOpen.value = false
  notice.value = form.value.id ? '账目已更新' : '账目已添加'
  const savedMonth = payload.occurred_on.slice(0, 7)
  if (month.value !== savedMonth) month.value = savedMonth
  else await loadRows()
  window.setTimeout(() => { notice.value = '' }, 3500)
}

async function deleteRow(row) {
  if (!window.confirm(`确定删除“${row.note || row.category}”这笔账目吗？`)) return
  const { error: deleteError } = await supabase.from('transactions').delete().eq('id', row.id)
  if (deleteError) { error.value = `删除失败：${deleteError.message}`; return }
  notice.value = '账目已删除'
  await loadRows()
  window.setTimeout(() => { notice.value = '' }, 3500)
}

function exportCsv() {
  const lines = [
    ['日期', '类型', '分类', '金额', '备注'],
    ...filteredRows.value.map((row) => [row.occurred_on, row.type === 'income' ? '收入' : '支出', row.category, row.amount, row.note || '']),
  ]
  const content = '\ufeff' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `日常账本-${month.value}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function switchView(view) { activeView.value = view; mobileNav.value = false }
</script>

<template>
  <div v-if="initializing" class="boot-screen"><div class="brand-icon"><WalletCards :size="26" /></div><p>正在打开账本…</p></div>

  <main v-else-if="!isConfigured" class="setup-screen">
    <div class="setup-card"><div class="brand-icon"><WalletCards :size="27" /></div><p class="eyebrow">开始之前</p><h1>连接你的云端账本</h1><p>复制 <code>.env.example</code> 为 <code>.env.local</code>，填写 Supabase 项目 URL 和 publishable key，然后重启开发服务器。详细步骤见 README。</p></div>
  </main>

  <main v-else-if="!session" class="auth-screen">
    <div class="auth-art"><div class="auth-art-inner"><div class="brand-lockup light"><div class="brand-icon"><WalletCards :size="26" /></div><span>日常账本</span></div><div class="auth-illustration"><span class="illustration-disc"></span><div class="illustration-card"><div class="illustration-line small"></div><div class="illustration-line"></div><div class="illustration-bars"><i></i><i></i><i></i><i></i><i></i></div></div><div class="illustration-dot dot-one"></div><div class="illustration-dot dot-two"></div></div><div class="art-caption"><p>把每一天的小事，<br />记成生活的大图景。</p><span>简单记录 · 安心保存 · 随时回看</span></div></div></div>
    <div class="auth-panel"><div class="auth-box"><p class="eyebrow">YOUR PERSONAL LEDGER</p><h1>{{ authMode === 'login' ? '欢迎回来' : '创建你的账本' }}</h1><p class="auth-subtitle">{{ authMode === 'login' ? '登录后，继续记录你的每一笔日常。' : '只需一个邮箱，开始管理日常收支。' }}</p><form @submit.prevent="submitAuth"><label for="email">邮箱地址</label><input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required /><label for="password">密码</label><input id="password" v-model="password" type="password" :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'" minlength="6" placeholder="至少 6 位字符" required /><p v-if="authError" class="form-message error" role="alert">{{ authError }}</p><p v-if="authNotice" class="form-message success" role="status">{{ authNotice }}</p><button class="btn btn-primary auth-submit" :disabled="authBusy">{{ authBusy ? '请稍候…' : authMode === 'login' ? '登录账本' : '注册账号' }} <ArrowRight :size="17" /></button></form><p class="auth-switch">{{ authMode === 'login' ? '还没有账号？' : '已经有账号？' }} <button type="button" @click="authMode = authMode === 'login' ? 'register' : 'login'; authError = ''; authNotice = ''">{{ authMode === 'login' ? '立即注册' : '返回登录' }}</button></p><p class="auth-footnote"><CircleHelp :size="15" /> 数据保存在你的 Supabase 项目中，仅你本人可查看。</p></div></div>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar" :class="{ 'is-open': mobileNav }"><div class="sidebar-top"><div class="brand-lockup"><div class="brand-icon"><WalletCards :size="23" /></div><span>日常账本</span></div><button class="icon-button mobile-close" aria-label="关闭菜单" @click="mobileNav = false"><X :size="20" /></button></div><div class="sidebar-section-label">工作空间</div><nav class="side-nav"><button :class="{ active: activeView === 'overview' }" @click="switchView('overview')"><LayoutDashboard :size="19" /> 总览</button><button :class="{ active: activeView === 'transactions' }" @click="switchView('transactions')"><WalletCards :size="19" /> 全部账目</button><button :class="{ active: activeView === 'insights' }" @click="switchView('insights')"><BarChart3 :size="19" /> 分类统计</button></nav><div class="sidebar-bottom"><div class="sidebar-note"><span class="note-spark">✦</span><strong>好习惯，从今天开始</strong><p>每一笔记录，都让生活更清晰一点。</p></div><div class="account-row"><div class="avatar">{{ session.user.email?.slice(0, 1).toUpperCase() }}</div><div class="account-text"><strong>我的账本</strong><small :title="session.user.email">{{ session.user.email }}</small></div><button class="icon-button" aria-label="退出登录" title="退出登录" @click="logout"><LogOut :size="18" /></button></div></div></aside>
    <div v-if="mobileNav" class="mobile-scrim" @click="mobileNav = false"></div>
    <div class="workspace"><header class="topbar"><button class="icon-button menu-button" aria-label="打开菜单" @click="mobileNav = true"><Menu :size="22" /></button><div class="breadcrumb">我的账本 <span>/</span> <strong>{{ activeView === 'overview' ? '总览' : activeView === 'transactions' ? '全部账目' : '分类统计' }}</strong></div><div class="topbar-right"><span class="today-label"><CalendarDays :size="16" /> {{ localDate() }}</span><div class="avatar top-avatar">{{ session.user.email?.slice(0, 1).toUpperCase() }}</div></div></header>
      <main class="content"><div class="page-heading"><div><p class="eyebrow">PERSONAL FINANCE</p><h1>{{ activeView === 'overview' ? '你的财务，一目了然' : activeView === 'transactions' ? '每一笔，都值得记录' : '看看钱都花在哪里' }}</h1><p class="page-description">{{ activeView === 'overview' ? '简单整理收支，认真过好每一天。' : activeView === 'transactions' ? '查看、筛选和管理你的日常账目。' : '从分类数据里，发现更适合自己的生活节奏。' }}</p></div><button class="btn btn-primary add-button" @click="openCreate"><Plus :size="18" /> 记一笔</button></div>
        <div class="period-bar"><div class="period-picker"><button class="icon-button" aria-label="上个月" @click="changeMonth(-1)"><ArrowLeft :size="17" /></button><span>{{ monthTitle(month) }}</span><button class="icon-button" aria-label="下个月" @click="changeMonth(1)"><ArrowRight :size="17" /></button></div><span class="period-hint">{{ rows.length }} 笔记录</span></div>
        <div v-if="error" class="inline-error" role="alert">{{ error }} <button @click="loadRows">重试</button></div><div v-if="notice" class="toast" role="status"><Check :size="17" />{{ notice }}</div>
        <section class="stat-grid"><div class="stat-card balance-card"><div class="stat-top"><span>本月结余</span><span class="stat-icon"><WalletCards :size="21" /></span></div><strong>{{ money(balance) }}</strong><p>收入减去支出，刚刚好</p><span class="balance-decor decor-one"></span><span class="balance-decor decor-two"></span></div><div class="stat-card"><div class="stat-top"><span>本月收入</span><span class="stat-icon income-icon"><ArrowDownLeft :size="21" /></span></div><strong>{{ money(income) }}</strong><p><span class="status-dot income-dot"></span> {{ rows.filter((r) => r.type === 'income').length }} 笔收入</p></div><div class="stat-card"><div class="stat-top"><span>本月支出</span><span class="stat-icon expense-icon"><ArrowUpRight :size="21" /></span></div><strong>{{ money(expense) }}</strong><p><span class="status-dot expense-dot"></span> {{ rows.filter((r) => r.type === 'expense').length }} 笔支出</p></div></section>
        <div class="dashboard-grid"><section v-if="activeView !== 'insights'" class="panel transactions-panel" :class="{ wide: activeView === 'transactions' }"><div class="panel-header"><div><h2>{{ activeView === 'overview' ? '最近记录' : '全部账目' }}</h2><p>{{ activeView === 'overview' ? '看看最近的收支动态' : '本月账目明细' }}</p></div><button v-if="activeView === 'overview'" class="text-link" @click="switchView('transactions')">查看全部 <ArrowRight :size="16" /></button><button v-else class="btn btn-subtle" :disabled="filteredRows.length === 0" @click="exportCsv"><Download :size="16" /> 导出 CSV</button></div><div v-if="activeView === 'transactions'" class="list-toolbar"><div class="search-box"><Search :size="17" /><input v-model="search" placeholder="搜索分类、备注或金额" aria-label="搜索账目" /></div><div class="select-wrap"><Settings2 :size="16" /><select v-model="filter" aria-label="按类型筛选"><option value="all">全部类型</option><option value="expense">只看支出</option><option value="income">只看收入</option></select><ChevronDown :size="15" /></div></div><div v-if="loading" class="empty-state">正在读取账目…</div><div v-else-if="listRows.length === 0" class="empty-state"><div class="empty-icon"><WalletCards :size="25" /></div><strong>{{ rows.length ? '没有符合条件的账目' : '这个月还没有记录' }}</strong><p>{{ rows.length ? '试试调整搜索或筛选条件。' : '记下第一笔收支，开始了解自己的日常。' }}</p><button v-if="!rows.length" class="btn btn-subtle" @click="openCreate"><Plus :size="16" /> 记一笔</button></div><div v-else class="transaction-list"><div v-for="row in listRows" :key="row.id" class="transaction-row"><div class="category-icon" :style="{ '--category-color': categoryMeta(row.type, row.category).color }"><component :is="iconFor(row.type, row.category)" :size="20" /></div><div class="transaction-name"><strong>{{ row.note || row.category }}</strong><span>{{ row.category }} · {{ row.occurred_on }}</span></div><strong class="transaction-amount" :class="row.type">{{ row.type === 'income' ? '+' : '−' }}{{ money(row.amount) }}</strong><div class="row-actions"><button class="icon-button" :aria-label="`编辑 ${row.note || row.category}`" @click="openEdit(row)"><Pencil :size="16" /></button><button class="icon-button danger-hover" :aria-label="`删除 ${row.note || row.category}`" @click="deleteRow(row)"><Trash2 :size="16" /></button></div></div></div></section>
          <section class="panel insights-panel" :class="{ wide: activeView === 'insights' }"><div class="panel-header"><div><h2>支出分类</h2><p>了解钱花在哪些地方</p></div><div class="panel-icon"><BarChart3 :size="19" /></div></div><div v-if="loading" class="empty-state small-empty">正在统计…</div><div v-else-if="!expenseGroups.length" class="empty-state small-empty"><div class="empty-icon"><BarChart3 :size="24" /></div><strong>暂无支出数据</strong><p>添加支出后，这里会显示分类占比。</p></div><div v-else class="category-list"><div v-for="group in expenseGroups" :key="group.name" class="category-group"><div class="category-line"><span class="category-label"><span class="category-mini" :style="{ background: categoryMeta('expense', group.name).color }"></span>{{ group.name }}</span><strong>{{ money(group.amount) }}</strong></div><div class="progress-track"><div class="progress-fill" :style="{ width: `${group.percent}%`, background: categoryMeta('expense', group.name).color }"></div></div><span class="category-percent">{{ group.percent.toFixed(1) }}%</span></div></div><div v-if="expenseGroups.length" class="insights-footer"><span>最大支出分类</span><strong>{{ expenseGroups[0].name }} · {{ expenseGroups[0].percent.toFixed(1) }}%</strong></div></section></div>
        <p class="content-footnote">日常账本 <span>·</span> 用简单的方式，认真记录生活。</p>
      </main></div>
  </div>

  <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><p class="eyebrow">A NEW ENTRY</p><h2 id="modal-title">{{ form.id ? '编辑账目' : '记一笔' }}</h2></div><button class="icon-button" aria-label="关闭" @click="modalOpen = false"><X :size="20" /></button></div><form @submit.prevent="saveRow"><div class="type-toggle"><button type="button" :class="{ selected: form.type === 'expense' }" @click="changeFormType('expense')"><ArrowUpRight :size="17" /> 支出</button><button type="button" :class="{ selected: form.type === 'income' }" @click="changeFormType('income')"><ArrowDownLeft :size="17" /> 收入</button></div><label for="amount">金额</label><div class="amount-input"><span>¥</span><input id="amount" v-model="form.amount" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" placeholder="0.00" required autofocus /></div><label for="category">分类</label><div class="select-input"><select id="category" v-model="form.category"><option v-for="item in categories[form.type]" :key="item.name" :value="item.name">{{ item.name }}</option></select><ChevronDown :size="18" /></div><label for="occurred-on">日期</label><input id="occurred-on" v-model="form.occurred_on" type="date" required /><label for="note">备注 <span class="optional">选填</span></label><input id="note" v-model="form.note" type="text" maxlength="200" placeholder="记下一点细节…" /><p v-if="formError" class="form-message error" role="alert">{{ formError }}</p><div class="modal-actions"><button type="button" class="btn btn-subtle" @click="modalOpen = false">取消</button><button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? '保存中…' : '保存账目' }}</button></div></form></div></div>
</template>
