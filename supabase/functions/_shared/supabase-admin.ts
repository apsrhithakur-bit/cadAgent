import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// Support both new and legacy environment variable names
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseSecretKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Missing Supabase admin environment variables (SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)')
}

// Create admin client with the secret key (formerly service_role key)
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Export for backward compatibility
export { supabaseSecretKey }