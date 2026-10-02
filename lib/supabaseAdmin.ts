import { createClient } from "@supabase/supabase-js";

// Client Supabase con privilegi completi, da usare SOLO in codice server
// (API routes, cron job) — mai esporlo al browser.
export function creaClientSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
