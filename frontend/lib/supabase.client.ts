import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  if (!_client) {
    _client = createBrowserClient(url, key);
  }
  return _client;
}
