import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  if (!supabaseUrl || !supabaseKey) {
    return response.status(500).json({ error: 'Missing Supabase environment variables.' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = Date.now()
  const { error } = await supabase
    .from('game_rooms')
    .select('id')
    .limit(1)

  if (error) {
    return response.status(502).json({ error: `Supabase ping failed: ${error.message}` })
  }

  return response.status(200).json({
    ok: true,
    pingedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
  })
}
