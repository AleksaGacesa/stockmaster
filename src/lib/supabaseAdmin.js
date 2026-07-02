import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Separate client used only for supabase.auth.signUp() when an owner
// creates a new employee account. signUp() replaces whatever session
// is active on the client it's called on — calling it on the shared
// `supabase` client would silently log the owner out and switch the
// app into the newly-created user's session. This client never
// persists or reuses a session, so it can't clobber the real one.
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
