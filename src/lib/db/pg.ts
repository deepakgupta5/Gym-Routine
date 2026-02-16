import { Pool } from "pg";
import dns from "dns/promises";
import { CONFIG } from "@/lib/config";

let poolPromise: Promise<Pool> | null = null;

async function createPool(): Promise<Pool> {
  const url = new URL(CONFIG.SUPABASE_DB_URL);
  const host = url.hostname;

  try {
    const addrs = await dns.resolve4(host);
    if (addrs && addrs.length > 0) {
      url.hostname = addrs[0];
    }
  } catch {
    // If resolve4 fails, fall back to original host
  }

  return new Pool({
    connectionString: url.toString(),
    max: 5,
    ssl: { rejectUnauthorized: false },
  });
}

export async function getDb(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = createPool();
  }
  return poolPromise;
}
