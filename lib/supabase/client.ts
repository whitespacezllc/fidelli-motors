import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Cliente de Supabase para los pocos Client Components que lo necesiten.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
