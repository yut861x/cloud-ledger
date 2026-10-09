<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BriefcaseBusiness,
  BusFront, CalendarDays, Check, ChevronDown, CircleHelp, Download, Gamepad2,
  Gift, HeartPulse, House, LayoutDashboard, LogOut, Menu, MoreHorizontal,
  Pencil, Plus, Search, Settings2, ShoppingBag, Trash2, TrendingUp,
  UtensilsCrossed, Wallet, WalletCards, X,
} from '@lucide/vue'
import { supabase, isConfigured } from './lib/supabase'
import { bookCategory, bookCategoryLabels, categories, categoryBreakdown, categoryMeta, csvCell, defaultEntryForBook, localDate, money, monthTitle } from './lib/ledger'
import { calendarDays, holidaySources } from './lib/calendar'
import PixelPieChart from './PixelPieChart.vue'

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
const books = ref([])
const activeBookId = ref(null)
const bookTypesReady = ref(true)
const booksLoading = ref(false)
const shortcutModalOpen = ref(false)
const shortcutTokenStatus = ref(null)
const shortcutToken = ref('')
const shortcutBusy = ref(false)
const shortcutError = ref('')
const salarySchedule = ref(null)
const salaryLoading = ref(false)
const salaryLoadError = ref('')
const salaryModalOpen = ref(false)
const salarySaving = ref(false)
const salaryError = ref('')
const salaryForm = ref({ amount: '', pay_day: 1, pay_time: '09:00', purpose: '', enabled: true })
const bookError = ref('')
const bookModalOpen = ref(false)
const bookSaving = ref(false)
const bookType = ref('dynamic_expense')
const bookName = ref('')
const editingBookId = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const activeView = ref('overview')
const mobileNav = ref(false)
const month = ref(localDate().slice(0, 7))
const selectedDay = ref(localDate())
const filter = ref('all')
const search = ref('')
const modalOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const form = ref(emptyForm())
let authSubscription
let requestId = 0
let booksRequestId = 0
let salaryRequestId = 0

function emptyForm() {
  return { id: null, book_id: activeBookId.value, type: 'expense', amount: '', category: '餐饮', occurred_on: localDate(), note: '' }
}

const activeBook = computed(() => books.value.find((book) => book.id === activeBookId.value))
const rowBookId = computed(() => activeView.value === 'overview' ? null : activeBookId.value)
const bookGroups = computed(() => bookCategoryLabels.map((group) => ({ ...group, items: books.value.filter((book) => bookCategory(book) === group.type) })))
const lockedBookType = computed(() => {
  const book = books.value.find((item) => item.id === editingBookId.value)
  return Boolean(book?.is_default || book?.is_salary || book?.is_fixed_expense)
})
const orderedBooks = computed(() => bookGroups.value.flatMap((group) => group.items))
const scheduledBook = computed(() => activeBook.value?.is_salary || activeBook.value?.is_fixed_expense)
const scheduleTable = computed(() => activeBook.value?.is_fixed_expense ? 'fixed_expense_schedules' : 'salary_schedules')
const scheduleKind = computed(() => activeBook.value?.is_fixed_expense ? '固定支出' : '工资')

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
const expenseGroups = computed(() => categoryBreakdown(rows.value, 'expense'))
const incomeGroups = computed(() => categoryBreakdown(rows.value, 'income'))
const recentRows = computed(() => rows.value.slice(0, 5))
const listRows = computed(() => activeView.value === 'overview' ? recentRows.value : filteredRows.value)
const days = computed(() => calendarDays(month.value, rows.value))
const selectedDayRows = computed(() => rows.value.filter((row) => row.occurred_on === selectedDay.value))
const selectedDayNet = computed(() => selectedDayRows.value.reduce((sum, row) => sum + (row.type === 'income' ? 1 : -1) * Number(row.amount), 0))
watch(month, () => { selectedDay.value = `${month.value}-01` })

onMounted(async () => {
  if (!supabase) { initializing.value = false; return }
  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) authError.value = sessionError.message
  session.value = data.session
  initializing.value = false
  const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
    const oldUser = session.value?.user?.id
    session.value = nextSession
    if (oldUser !== nextSession?.user?.id) {
      rows.value = []
      books.value = []
      activeBookId.value = null
      salarySchedule.value = null
      shortcutTokenStatus.value = null
      shortcutToken.value = ''
      shortcutModalOpen.value = false
      ++requestId
      ++booksRequestId
      ++salaryRequestId
    }
  })
  authSubscription = listener.subscription
})
onUnmounted(() => authSubscription?.unsubscribe())
watch(() => session.value?.user?.id, (userId) => { if (userId) loadBooks() }, { immediate: true })
watch([month, rowBookId, activeView, () => session.value?.user?.id], () => {
  if (session.value?.user && (activeView.value === 'overview' || activeBookId.value)) loadRows()
  else { ++requestId; rows.value = []; loading.value = false }
})
watch(activeBookId, () => {
  if (scheduledBook.value) loadSalarySchedule()
  else {
    ++salaryRequestId
    salarySchedule.value = null
    salaryLoading.value = false
    salaryLoadError.value = ''
  }
})

async function loadBooks() {
  if (!session.value?.user || !supabase) return
  const currentRequest = ++booksRequestId
  booksLoading.value = true
  bookError.value = ''
  const queryBooks = (columns) => supabase.from('ledger_books')
    .select(columns)
    .order('is_default', { ascending: false })
    .order('is_salary', { ascending: false })
    .order('is_fixed_expense', { ascending: false })
    .order('created_at')
  let result = await queryBooks('id,name,book_type,is_default,is_salary,is_fixed_expense,created_at')
  const hasBookTypes = !(result.error && /book_type/.test(result.error.message))
  if (!hasBookTypes) {
    result = await queryBooks('id,name,is_default,is_salary,is_fixed_expense,created_at')
  }
  if (currentRequest !== booksRequestId) return
  bookTypesReady.value = hasBookTypes
  booksLoading.value = false
  if (result.error) { bookError.value = `读取账本失败：${result.error.message}`; return }
  books.value = result.data || []
  if (!books.value.some((book) => book.id === activeBookId.value)) {
    activeBookId.value = books.value.find((book) => book.is_default)?.id || books.value[0]?.id || null
  }
}

async function loadSalarySchedule() {
  if (!session.value?.user || !scheduledBook.value) return
  const bookId = activeBookId.value
  const currentRequest = ++salaryRequestId
  salaryLoading.value = true
  salarySchedule.value = null
  salaryLoadError.value = ''
  const { data, error: queryError } = await supabase.from(scheduleTable.value)
    .select(activeBook.value?.is_fixed_expense ? 'id,amount,pay_day,pay_time,purpose,enabled' : 'id,amount,pay_day,pay_time,enabled').eq('book_id', bookId).maybeSingle()
  if (currentRequest !== salaryRequestId) return
  salaryLoading.value = false
  if (queryError) { salaryLoadError.value = `读取${scheduleKind.value}计划失败：${queryError.message}`; return }
  salarySchedule.value = data
}

function openSalaryModal() {
  const current = salarySchedule.value
  salaryForm.value = {
    amount: current ? String(current.amount) : '',
    pay_day: current?.pay_day || 1,
    pay_time: current?.pay_time?.slice(0, 5) || '09:00',
    purpose: current?.purpose || '',
    enabled: current?.enabled ?? true,
  }
  salaryError.value = ''
  salaryModalOpen.value = true
}

async function saveSalarySchedule() {
  salaryError.value = ''
  const amount = Number(salaryForm.value.amount)
  const payDay = Number(salaryForm.value.pay_day)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 ||
    !/^\d+(\.\d{1,2})?$/.test(String(salaryForm.value.amount))) {
    salaryError.value = '金额须大于 0，最多两位小数。'; return
  }
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
    salaryError.value = '计划日期须在 1–31 日之间。'; return
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(salaryForm.value.pay_time)) {
    salaryError.value = '请选择有效时间。'; return
  }
  if (activeBook.value?.is_fixed_expense && !salaryForm.value.purpose.trim()) {
    salaryError.value = '请填写用途。'; return
  }
  salarySaving.value = true
  const payload = {
    amount: amount.toFixed(2), pay_day: payDay,
    pay_time: salaryForm.value.pay_time, enabled: salaryForm.value.enabled,
    ...(activeBook.value?.is_fixed_expense ? { purpose: salaryForm.value.purpose.trim() } : {}),
  }
  const result = salarySchedule.value
    ? await supabase.from(scheduleTable.value).update(payload)
      .eq('id', salarySchedule.value.id).select('id').single()
    : await supabase.from(scheduleTable.value).insert({
      ...payload, user_id: session.value.user.id, book_id: activeBookId.value,
    }).select('id').single()
  salarySaving.value = false
  if (result.error) { salaryError.value = `保存失败：${result.error.message}`; return }
  salaryModalOpen.value = false
  await loadSalarySchedule()
  notice.value = `${scheduleKind.value}自动记录计划已保存`
  window.setTimeout(() => { notice.value = '' }, 3500)
}

function selectBook(id) {
  activeBookId.value = id
  activeView.value = 'transactions'
  mobileNav.value = false
  filter.value = 'all'
  search.value = ''
}

function openBookModal(book = null) {
  editingBookId.value = book?.id || null
  bookName.value = book?.name || ''
  bookType.value = book ? bookCategory(book) : 'dynamic_expense'
  bookError.value = ''
  bookModalOpen.value = true
}

async function saveBook() {
  const name = bookName.value.trim()
  if (!bookTypesReady.value) { bookError.value = '请先在 Supabase SQL Editor 执行 add_book_types.sql，再保存账本。'; return }
  if (!name || name.length > 40) { bookError.value = '账本名称须为 1–40 个字符。'; return }
  if (books.value.some((book) => book.id !== editingBookId.value && book.name === name)) {
    bookError.value = '已有同名账本。'; return
  }
  bookSaving.value = true
  bookError.value = ''
  const editingBook = books.value.find((book) => book.id === editingBookId.value)
  const payload = { name, book_type: editingBook?.is_default || editingBook?.is_salary || editingBook?.is_fixed_expense
    ? bookCategory(editingBook) : bookType.value }
  const result = editingBookId.value
    ? await supabase.from('ledger_books').update(payload).eq('id', editingBookId.value).select('id').single()
    : await supabase.from('ledger_books').insert({ user_id: session.value.user.id, ...payload }).select('id').single()
  bookSaving.value = false
  if (result.error) { bookError.value = `保存失败：${result.error.message}`; return }
  bookModalOpen.value = false
  await loadBooks()
  if (!editingBookId.value) selectBook(result.data.id)
  notice.value = editingBookId.value ? '账本已更新' : '账本已创建'
  window.setTimeout(() => { notice.value = '' }, 3500)
}

async function loadRows() {
  if (!session.value?.user || !supabase || (activeView.value !== 'overview' && !activeBookId.value)) return
  const currentRequest = ++requestId
  loading.value = true
  rows.value = []
  error.value = ''
  const pageSize = 1000
  const allRows = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from('transactions')
      .select('id,book_id,type,amount,category,note,occurred_on,created_at')
      .gte('occurred_on', monthStart.value).lt('occurred_on', nextMonth.value)
    query = activeView.value === 'overview'
      ? query.eq('user_id', session.value.user.id)
      : query.eq('book_id', activeBookId.value)
    const { data, error: queryError } = await query
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (currentRequest !== requestId) return
    if (queryError) {
      loading.value = false
      error.value = `读取账目失败：${queryError.message}`
      return
    }
    allRows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  loading.value = false
  rows.value = allRows
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

async function openShortcutModal() {
  shortcutModalOpen.value = true
  shortcutToken.value = ''
  shortcutError.value = ''
  shortcutBusy.value = true
  const { data, error: queryError } = await supabase.from('shortcut_tokens').select('created_at').maybeSingle()
  shortcutBusy.value = false
  if (queryError) shortcutError.value = `读取接入状态失败：${queryError.message}`
  else shortcutTokenStatus.value = data
}

async function rotateShortcutToken() {
  shortcutBusy.value = true
  shortcutError.value = ''
  const { data, error: callError } = await supabase.rpc('rotate_shortcut_token')
  shortcutBusy.value = false
  if (callError) { shortcutError.value = `生成失败：${callError.message}`; return }
  shortcutToken.value = data
  shortcutTokenStatus.value = { created_at: new Date().toISOString() }
}

async function revokeShortcutToken() {
  shortcutBusy.value = true
  shortcutError.value = ''
  const { error: callError } = await supabase.rpc('revoke_shortcut_token')
  shortcutBusy.value = false
  if (callError) { shortcutError.value = `撤销失败：${callError.message}`; return }
  shortcutToken.value = ''
  shortcutTokenStatus.value = null
}

async function copyShortcutToken() {
  try { await navigator.clipboard.writeText(shortcutToken.value); notice.value = '密钥已复制' }
  catch { shortcutError.value = '复制失败，请手动复制密钥。' }
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
  if (!activeBookId.value) { bookError.value = '请先选择账本。'; return }
  form.value = {
    ...emptyForm(),
    ...defaultEntryForBook(activeBook.value?.name, activeBook.value?.is_salary, activeBook.value?.is_fixed_expense, bookCategory(activeBook.value)),
    occurred_on: month.value === localDate().slice(0, 7) ? localDate() : `${month.value}-01`,
  }
  formError.value = ''
  modalOpen.value = true
}
function openEdit(row) {
  form.value = { id: row.id, book_id: row.book_id, type: row.type, amount: String(row.amount), category: row.category, occurred_on: row.occurred_on, note: row.note || '' }
  formError.value = ''
  modalOpen.value = true
}
function changeFormType(type) {
  form.value.type = type
  form.value.category = categories[type][0].name
}
function changeEntryBook() {
  if (form.value.id) return
  const book = books.value.find((item) => item.id === form.value.book_id)
  Object.assign(form.value, defaultEntryForBook(book?.name, book?.is_salary, book?.is_fixed_expense, bookCategory(book)))
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
  if (!books.value.some((book) => book.id === form.value.book_id)) {
    formError.value = '请选择有效账本。'; return
  }
  saving.value = true
  const payload = {
    book_id: form.value.book_id, type: form.value.type, amount: amount.toFixed(2), category: form.value.category,
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
  const bookChanged = activeBookId.value !== payload.book_id
  const monthChanged = month.value !== savedMonth
  if (bookChanged) activeBookId.value = payload.book_id
  if (monthChanged) month.value = savedMonth
  if (!monthChanged && (!bookChanged || activeView.value === 'overview')) await loadRows()
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
  anchor.download = `${activeBook.value?.name || '账本'}-${month.value}.csv`
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
    <aside class="sidebar" :class="{ 'is-open': mobileNav }"><div class="sidebar-top"><div class="brand-lockup"><div class="brand-icon"><WalletCards :size="23" /></div><span>日常账本</span></div><button class="icon-button mobile-close" aria-label="关闭菜单" @click="mobileNav = false"><X :size="20" /></button></div><div class="sidebar-section-label">工作空间</div><nav class="side-nav"><button :class="{ active: activeView === 'overview' }" @click="switchView('overview')"><LayoutDashboard :size="19" /> 总览</button><button :class="{ active: activeView === 'transactions' }" @click="switchView('transactions')"><WalletCards :size="19" /> 全部账目</button><button :class="{ active: activeView === 'insights' }" @click="switchView('insights')"><BarChart3 :size="19" /> 分类统计</button><button :class="{ active: activeView === 'calendar' }" @click="switchView('calendar')"><CalendarDays :size="19" /> 日历</button></nav><div class="books-heading"><span>账本</span><button class="icon-button" aria-label="新增账本" title="新增账本" @click="openBookModal()"><Plus :size="17" /></button></div><div class="book-list"><div v-if="booksLoading" class="book-status">正在读取账本…</div><template v-for="group in bookGroups" :key="group.type"><div v-if="group.items.length" class="book-group-label">{{ group.label }}</div><div v-for="book in group.items" :key="book.id" class="book-item" :class="{ active: activeView !== 'overview' && book.id === activeBookId, 'income-book': group.type.endsWith('income') }"><button class="book-select" :aria-current="activeView !== 'overview' && book.id === activeBookId ? 'page' : undefined" :aria-label="`${group.label}：${book.name}`" @click="selectBook(book.id)"><span v-if="group.type.endsWith('income')" class="income-book-icon"><Wallet :size="17" /></span><WalletCards v-else :size="17" /><span>{{ book.name }}</span></button><button class="icon-button book-edit" :aria-label="`编辑${book.name}`" :title="`编辑${book.name}`" @click="openBookModal(book)"><Pencil :size="14" /></button></div></template><div v-if="!booksLoading && !books.length" class="book-status">暂无账本</div></div><div class="sidebar-bottom"><button class="shortcut-entry-button" @click="openShortcutModal"><CalendarDays :size=16 /> 快捷指令接入</button><div class="sidebar-note"><span class="note-spark">✦</span><strong>好习惯，从今天开始</strong><p>每一笔记录，都让生活更清晰一点。</p></div><div class="account-row"><div class="avatar">{{ session.user.email?.slice(0, 1).toUpperCase() }}</div><div class="account-text"><strong>{{ activeBook?.name || '我的账本' }}</strong><small :title="session.user.email">{{ session.user.email }}</small></div><button class="icon-button" aria-label="退出登录" title="退出登录" @click="logout"><LogOut :size="18" /></button></div></div></aside>
    <div v-if="mobileNav" class="mobile-scrim" @click="mobileNav = false"></div>
    <div class="workspace"><header class="topbar"><button class="icon-button menu-button" aria-label="打开菜单" @click="mobileNav = true"><Menu :size="22" /></button><div class="breadcrumb">{{ activeView === 'overview' ? '所有账本' : activeBook?.name || '我的账本' }} <span>/</span> <strong>{{ activeView === 'overview' ? '总览' : activeView === 'transactions' ? '全部账目' : activeView === 'calendar' ? '日历' : '分类统计' }}</strong></div><div class="topbar-right"><span class="today-label"><CalendarDays :size="16" /> {{ localDate() }}</span><div class="avatar top-avatar">{{ session.user.email?.slice(0, 1).toUpperCase() }}</div></div></header>
      <main class="content"><div class="page-heading"><div><p class="eyebrow">PERSONAL FINANCE</p><h1>{{ activeView === 'overview' ? '你的财务，一目了然' : activeView === 'transactions' ? '每一笔，都值得记录' : activeView === 'calendar' ? '把日子和收支放在一起' : '看看钱都花在哪里' }}</h1><p class="page-description">{{ activeView === 'overview' ? '简单整理收支，认真过好每一天。' : activeView === 'transactions' ? '查看、筛选和管理你的日常账目。' : activeView === 'calendar' ? '每日净收入与中国大陆放假调休，一眼看清。' : '从分类数据里，发现更适合自己的生活节奏。' }}</p></div><button class="btn btn-primary add-button" :disabled="!activeBookId" @click="openCreate"><Plus :size="18" /> 记一笔</button></div>
        <div class="period-bar"><div class="period-picker"><button class="icon-button" aria-label="上个月" @click="changeMonth(-1)"><ArrowLeft :size="17" /></button><span>{{ monthTitle(month) }}</span><button class="icon-button" aria-label="下个月" @click="changeMonth(1)"><ArrowRight :size="17" /></button></div><span class="period-hint">{{ rows.length }} 笔记录</span></div>
        <section v-if="activeView !== 'overview' && scheduledBook" class="salary-banner" :aria-label="`每月${scheduleKind}自动记录`"><div class="salary-banner-icon"><CalendarDays :size="20" /></div><div class="salary-banner-copy"><strong>每月自动记{{ scheduleKind }}</strong><p v-if="salaryLoading">正在读取工资计划…</p><p v-else-if="salarySchedule">{{ salarySchedule.enabled ? '已启用' : '已暂停' }} · 每月 {{ salarySchedule.pay_day }} 日 {{ salarySchedule.pay_time.slice(0, 5) }}（北京时间） · {{ money(salarySchedule.amount) }}<template v-if="activeBook?.is_fixed_expense"> · {{ salarySchedule.purpose }}</template></p><p v-else>设定每月日期、时间和金额，到点自动记入{{ scheduleKind }}账本。</p></div><button class="btn btn-subtle" :disabled="salaryLoading || !!salaryLoadError" @click="openSalaryModal">{{ salarySchedule ? '修改计划' : '设置计划' }}</button></section>
        <div v-if="activeView !== 'overview' && salaryLoadError" class="inline-error" role="alert">{{ salaryLoadError }} <button @click="loadSalarySchedule">重试</button></div>
        <div v-if="bookError && !bookModalOpen" class="inline-error" role="alert">{{ bookError }} <button @click="loadBooks">重试</button></div><div v-if="error" class="inline-error" role="alert">{{ error }} <button @click="loadRows">重试</button></div><div v-if="notice" class="toast" role="status"><Check :size="17" />{{ notice }}</div>
        <section class="stat-grid"><div class="stat-card balance-card"><div class="stat-top"><span>本月结余</span><span class="stat-icon"><WalletCards :size="21" /></span></div><strong>{{ money(balance) }}</strong><p>收入减去支出，刚刚好</p><span class="balance-decor decor-one"></span><span class="balance-decor decor-two"></span></div><div class="stat-card"><div class="stat-top"><span>本月收入</span><span class="stat-icon income-icon"><ArrowDownLeft :size="21" /></span></div><strong>{{ money(income) }}</strong><p><span class="status-dot income-dot"></span> {{ rows.filter((r) => r.type === 'income').length }} 笔收入</p></div><div class="stat-card"><div class="stat-top"><span>本月支出</span><span class="stat-icon expense-icon"><ArrowUpRight :size="21" /></span></div><strong>{{ money(expense) }}</strong><p><span class="status-dot expense-dot"></span> {{ rows.filter((r) => r.type === 'expense').length }} 笔支出</p></div></section>
        <section v-if="activeView === 'overview'" class="pixel-pies" aria-label="本月收支分类饼图">
          <PixelPieChart type="expense" :groups="expenseGroups" :loading="loading" />
          <PixelPieChart type="income" :groups="incomeGroups" :loading="loading" />
        </section>
        <div v-if="activeView !== 'calendar'" class="dashboard-grid"><section v-if="activeView !== 'insights'" class="panel transactions-panel" :class="{ wide: activeView === 'transactions' || activeView === 'overview' }"><div class="panel-header"><div><h2>{{ activeView === 'overview' ? '最近记录' : '全部账目' }}</h2><p>{{ activeView === 'overview' ? '看看最近的收支动态' : '本月账目明细' }}</p></div><button v-if="activeView === 'overview'" class="text-link" @click="switchView('transactions')">查看当前账本 <ArrowRight :size="16" /></button><button v-else class="btn btn-subtle" :disabled="filteredRows.length === 0" @click="exportCsv"><Download :size="16" /> 导出 CSV</button></div><div v-if="activeView === 'transactions'" class="list-toolbar"><div class="search-box"><Search :size="17" /><input v-model="search" placeholder="搜索分类、备注或金额" aria-label="搜索账目" /></div><div class="select-wrap"><Settings2 :size="16" /><select v-model="filter" aria-label="按类型筛选"><option value="all">全部类型</option><option value="expense">只看支出</option><option value="income">只看收入</option></select><ChevronDown :size="15" /></div></div><div v-if="loading" class="empty-state">正在读取账目…</div><div v-else-if="listRows.length === 0" class="empty-state"><div class="empty-icon"><WalletCards :size="25" /></div><strong>{{ rows.length ? '没有符合条件的账目' : '这个月还没有记录' }}</strong><p>{{ rows.length ? '试试调整搜索或筛选条件。' : '记下第一笔收支，开始了解自己的日常。' }}</p><button v-if="!rows.length" class="btn btn-subtle" @click="openCreate"><Plus :size="16" /> 记一笔</button></div><div v-else class="transaction-list"><div v-for="row in listRows" :key="row.id" class="transaction-row"><div class="category-icon" :style="{ '--category-color': categoryMeta(row.type, row.category).color }"><component :is="iconFor(row.type, row.category)" :size="20" /></div><div class="transaction-name"><strong>{{ row.note || row.category }}</strong><span>{{ row.category }}<template v-if="activeView === 'overview'"> · {{ books.find((book) => book.id === row.book_id)?.name || '账本' }}</template> · {{ row.occurred_on }}</span></div><strong class="transaction-amount" :class="row.type">{{ row.type === 'income' ? '+' : '−' }}{{ money(row.amount) }}</strong><div class="row-actions"><button class="icon-button" :aria-label="`编辑 ${row.note || row.category}`" @click="openEdit(row)"><Pencil :size="16" /></button><button class="icon-button danger-hover" :aria-label="`删除 ${row.note || row.category}`" @click="deleteRow(row)"><Trash2 :size="16" /></button></div></div></div></section>
          <section v-if="activeView === 'insights'" class="panel insights-panel" :class="{ wide: activeView === 'insights' }"><div class="panel-header"><div><h2>支出分类</h2><p>了解钱花在哪些地方</p></div><div class="panel-icon"><BarChart3 :size="19" /></div></div><div v-if="loading" class="empty-state small-empty">正在统计…</div><div v-else-if="!expenseGroups.length" class="empty-state small-empty"><div class="empty-icon"><BarChart3 :size="24" /></div><strong>暂无支出数据</strong><p>添加支出后，这里会显示分类占比。</p></div><div v-else class="category-list"><div v-for="group in expenseGroups" :key="group.name" class="category-group"><div class="category-line"><span class="category-label"><span class="category-mini" :style="{ background: categoryMeta('expense', group.name).color }"></span>{{ group.name }}</span><strong>{{ money(group.amount) }}</strong></div><div class="progress-track"><div class="progress-fill" :style="{ width: `${group.percent}%`, background: categoryMeta('expense', group.name).color }"></div></div><span class="category-percent">{{ group.percent.toFixed(1) }}%</span></div></div><div v-if="expenseGroups.length" class="insights-footer"><span>最大支出分类</span><strong>{{ expenseGroups[0].name }} · {{ expenseGroups[0].percent.toFixed(1) }}%</strong></div></section></div>
        <section v-if="activeView === 'calendar'" class="calendar-panel" aria-label="月历">
          <div class="calendar-head"><div><h2>{{ monthTitle(month) }} · 收支日历</h2><p>当前账本：{{ activeBook?.name }} · 每日净收入 = 收入 − 支出</p></div><div class="calendar-legend"><span><i class="legend-holiday"></i> 假期</span><span><i class="legend-workday"></i> 调休上班</span></div></div>
          <div class="calendar-grid"><div v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday" class="calendar-weekday">周{{ weekday }}</div><template v-for="(day, index) in days" :key="day?.date || `blank-${index}`"><div v-if="!day" class="calendar-empty"></div><button v-else type="button" class="calendar-day" :class="{ selected: selectedDay === day.date, today: localDate() === day.date, holiday: day.kind === 'holiday', workday: day.kind === 'workday' }" :aria-label="`${day.date}${day.label ? ` ${day.label}` : ''}，净收入${day.net.toFixed(2)}元`" @click="selectedDay = day.date"><span class="calendar-day-top"><strong>{{ day.day }}</strong><em v-if="day.kind">{{ day.kind === 'holiday' ? '休' : '班' }}</em></span><small v-if="day.label" class="calendar-holiday-name">{{ day.label }}</small><span class="calendar-net" :class="day.net > 0 ? 'positive' : 'nonpositive'">{{ day.net > 0 ? '+' : day.net < 0 ? '−' : '' }}{{ money(Math.abs(day.net)) }}</span></button></template></div>
          <div class="calendar-bottom"><div class="calendar-source" v-if="holidaySources[Number(month.slice(0, 4))]">假期与调休依据：<a :href="holidaySources[Number(month.slice(0, 4))]" target="_blank" rel="noopener noreferrer">国务院办公厅 {{ month.slice(0, 4) }} 年通知 ↗</a></div><div class="calendar-source" v-else>该年份的官方放假调休安排尚未录入，仅展示每日收支；不推测假期。</div><div class="calendar-detail"><div><h3>{{ selectedDay }} 的账目</h3><p>{{ selectedDayRows.length }} 笔记录</p></div><strong :class="selectedDayNet > 0 ? 'positive' : 'nonpositive'">净收入 {{ selectedDayNet > 0 ? '+' : selectedDayNet < 0 ? '−' : '' }}{{ money(Math.abs(selectedDayNet)) }}</strong></div><div v-if="!selectedDayRows.length" class="calendar-no-rows">当天暂无账目</div><div v-for="row in selectedDayRows" :key="row.id" class="calendar-entry"><span>{{ row.note || row.category }} <small>· {{ row.category }}</small></span><strong :class="row.type === 'income' ? 'positive' : 'nonpositive'">{{ row.type === 'income' ? '+' : '−' }}{{ money(row.amount) }}</strong></div></div>
        </section>
        <p class="content-footnote">日常账本 <span>·</span> 用简单的方式，认真记录生活。</p>
      </main></div>
  </div>

  <div v-if="shortcutModalOpen" class="modal-backdrop" @click.self="shortcutModalOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-modal-title"><div class="modal-header"><div><p class="eyebrow">IPHONE SHORTCUT</p><h2 id="shortcut-modal-title">快捷指令接入</h2></div><button class="icon-button" aria-label="关闭" @click="shortcutModalOpen = false"><X :size="20" /></button></div><p class="shortcut-help">生成专用密钥后，填入 iPhone 快捷指令的 HTTPS 请求。密钥仅能新增你自己的账目，请不要分享；重新生成会使旧密钥失效。</p><p class="shortcut-guide"><a href="https://github.com/yut861x/cloud-ledger/blob/main/SHORTCUT_SETUP.md" target="_blank" rel="noopener noreferrer">查看 iPhone 快捷指令配置步骤 ↗</a></p><p class="shortcut-status">{{ shortcutTokenStatus ? '已启用 · ' + new Date(shortcutTokenStatus.created_at).toLocaleString('zh-CN') : '尚未启用' }}</p><div v-if="shortcutToken" class="shortcut-token"><label for="shortcut-key">专用密钥（只显示这一次）</label><input id="shortcut-key" :value="shortcutToken" readonly @focus="$event.target.select()" /><button class="btn btn-subtle" @click="copyShortcutToken">复制密钥</button></div><p v-if="shortcutError" class="form-message error" role="alert">{{ shortcutError }}</p><div class="modal-actions"><button v-if="shortcutTokenStatus" class="btn btn-subtle" :disabled="shortcutBusy" @click="revokeShortcutToken">撤销密钥</button><button class="btn btn-primary" :disabled="shortcutBusy" @click="rotateShortcutToken">{{ shortcutBusy ? '处理中…' : shortcutTokenStatus ? '重新生成' : '生成密钥' }}</button></div></div></div>
  <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><p class="eyebrow">A NEW ENTRY</p><h2 id="modal-title">{{ form.id ? '编辑账目' : '记一笔' }}</h2></div><button class="icon-button" aria-label="关闭" @click="modalOpen = false"><X :size="20" /></button></div><form @submit.prevent="saveRow"><label for="entry-book">账本</label><div class="select-input"><select id="entry-book" v-model="form.book_id" @change="changeEntryBook"><option v-for="book in orderedBooks" :key="book.id" :value="book.id">{{ book.name }}</option></select><ChevronDown :size="18" /></div><div class="type-toggle"><button type="button" :class="{ selected: form.type === 'expense' }" @click="changeFormType('expense')"><ArrowUpRight :size="17" /> 支出</button><button type="button" :class="{ selected: form.type === 'income' }" @click="changeFormType('income')"><ArrowDownLeft :size="17" /> 收入</button></div><label for="amount">金额</label><div class="amount-input"><span>¥</span><input id="amount" v-model="form.amount" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" placeholder="0.00" required autofocus /></div><label for="category">分类</label><div class="select-input"><select id="category" v-model="form.category"><option v-for="item in categories[form.type]" :key="item.name" :value="item.name">{{ item.name }}</option></select><ChevronDown :size="18" /></div><label for="occurred-on">日期</label><input id="occurred-on" v-model="form.occurred_on" type="date" required /><label for="note">备注 <span class="optional">选填</span></label><input id="note" v-model="form.note" type="text" maxlength="200" placeholder="记下一点细节…" /><p v-if="formError" class="form-message error" role="alert">{{ formError }}</p><div class="modal-actions"><button type="button" class="btn btn-subtle" @click="modalOpen = false">取消</button><button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? '保存中…' : '保存账目' }}</button></div></form></div></div>
  <div v-if="salaryModalOpen" class="modal-backdrop" @click.self="salaryModalOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="salary-modal-title"><div class="modal-header"><div><p class="eyebrow">MONTHLY ENTRY</p><h2 id="salary-modal-title">每月自动记{{ scheduleKind }}</h2></div><button class="icon-button" aria-label="关闭" @click="salaryModalOpen = false"><X :size="20" /></button></div><form @submit.prevent="saveSalarySchedule"><label for="salary-amount">每月金额</label><div class="amount-input"><span>¥</span><input id="salary-amount" v-model="salaryForm.amount" type="number" min="0.01" max="9999999999.99" step="0.01" inputmode="decimal" placeholder="0.00" required autofocus /></div><div class="salary-fields"><div><label for="salary-day">每月记账日</label><div class="select-input"><select id="salary-day" v-model.number="salaryForm.pay_day"><option v-for="day in 31" :key="day" :value="day">{{ day }} 日</option></select><ChevronDown :size="17" /></div></div><div><label for="salary-time">记账时间（北京时间）</label><input id="salary-time" v-model="salaryForm.pay_time" type="time" required /></div></div><template v-if="activeBook?.is_fixed_expense"><label for="schedule-purpose">用途</label><input id="schedule-purpose" v-model="salaryForm.purpose" type="text" maxlength="100" placeholder="例如：房租、会员费" required /></template><p class="salary-hint">如设为 31 日，短月按当月最后一天记录。计划从下一个尚未到达的记账时间起生效。</p><label class="salary-switch" for="salary-enabled"><input id="salary-enabled" v-model="salaryForm.enabled" type="checkbox" /><span>启用自动记账</span></label><p v-if="salaryError" class="form-message error" role="alert">{{ salaryError }}</p><div class="modal-actions"><button type="button" class="btn btn-subtle" @click="salaryModalOpen = false">取消</button><button type="submit" class="btn btn-primary" :disabled="salarySaving">{{ salarySaving ? '保存中…' : '保存计划' }}</button></div></form></div></div>
  <div v-if="bookModalOpen" class="modal-backdrop" @click.self="bookModalOpen = false"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="book-modal-title"><div class="modal-header"><div><p class="eyebrow">LEDGER BOOK</p><h2 id="book-modal-title">{{ editingBookId ? '编辑账本' : '新增账本' }}</h2></div><button class="icon-button" aria-label="关闭" @click="bookModalOpen = false"><X :size="20" /></button></div><form @submit.prevent="saveBook"><label for="book-name">账本名称</label><input id="book-name" v-model="bookName" type="text" maxlength="40" placeholder="例如：旅行、家庭开支" required autofocus /><label>账本类别</label><div class="book-type-options" role="group" aria-label="账本类别"><button v-for="option in bookCategoryLabels" :key="option.type" type="button" :class="{ selected: bookType === option.type }" :disabled="lockedBookType" @click="bookType = option.type"><Wallet v-if="option.type.endsWith('income')" :size="17" /><WalletCards v-else :size="17" />{{ option.label }}</button></div><p v-if="lockedBookType" class="book-type-hint">内置账本的类别固定，仍可修改名称。</p><p v-else class="book-type-hint">“固定”是分类标记；自动记账计划仅适用于内置固定账本。</p><p v-if="!bookTypesReady" class="form-message error">请先在 Supabase SQL Editor 执行 add_book_types.sql，才能保存账本类别。</p><p v-if="bookError" class="form-message error" role="alert">{{ bookError }}</p><div class="modal-actions"><button type="button" class="btn btn-subtle" @click="bookModalOpen = false">取消</button><button type="submit" class="btn btn-primary"  :disabled="bookSaving || !bookTypesReady">{{ bookSaving ? '保存中…' : '保存账本' }}</button></div></form></div></div>
</template>
