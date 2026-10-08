import { createClient } from 'npm:@supabase/supabase-js@2'

const expenseCategories = new Set(['餐饮', '购物', '交通', '居住', '娱乐', '健康', '其他'])
const incomeCategories = new Set(['工资', '奖金', '理财', '其他'])
const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response(405, { error: 'POST required' })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response(415, { error: 'JSON required' })
  if (Number(request.headers.get('content-length') || 0) > 8192) return response(413, { error: 'Request too large' })
  const match = /^Bearer (cl_[0-9a-f]{64})$/.exec(request.headers.get('authorization') || '')
  if (!match) return response(401, { error: 'Invalid shortcut token' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return response(503, { error: 'Function is not configured' })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: credential, error: tokenError } = await db.from('shortcut_tokens')
    .select('user_id').eq('token_hash', await sha256(match[1])).maybeSingle()
  if (tokenError) return response(503, { error: 'Token lookup failed' })
  if (!credential) return response(401, { error: 'Invalid shortcut token' })

  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > 8192) return response(413, { error: 'Request too large' })
    body = JSON.parse(text)
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Not an object')
  } catch { return response(400, { error: 'Invalid JSON' }) }

  const type = body.type
  const category = body.category
  const amountText = String(body.amount ?? '')
  const amount = Number(amountText)
  const note = body.note == null ? null : String(body.note).trim()
  const occurredOn = body.occurred_on
  if (type !== 'expense' && type !== 'income') return response(400, { error: 'Invalid type' })
  if (typeof category !== 'string' || !(type === 'expense' ? expenseCategories : incomeCategories).has(category)) return response(400, { error: 'Invalid category' })
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) return response(400, { error: 'Invalid amount' })
  if (!validDate(occurredOn)) return response(400, { error: 'Invalid date' })
  if (note && note.length > 200) return response(400, { error: 'Note too long' })

  let bookId = body.book_id
  if (bookId != null && (typeof bookId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookId))) return response(400, { error: 'Invalid book' })
  let bookQuery = db.from('ledger_books').select('id').eq('user_id', credential.user_id)
  bookQuery = bookId ? bookQuery.eq('id', bookId as string) : bookQuery.eq('is_default', true)
  const { data: book, error: bookError } = await bookQuery.maybeSingle()
  if (bookError) return response(503, { error: 'Book lookup failed' })
  if (!book) return response(400, { error: 'Book not found' })
  bookId = book.id

  const { data, error } = await db.from('transactions').insert({
    user_id: credential.user_id, book_id: bookId, type, category,
    amount: amount.toFixed(2), note: note || null, occurred_on: occurredOn,
  }).select('id').single()
  if (error) return response(503, { error: 'Could not save entry' })
  return response(201, { ok: true, id: data.id })
})
