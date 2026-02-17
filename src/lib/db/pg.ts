import { Pool } from "pg";
import dns from "dns/promises";
import { CONFIG } from "@/lib/config";

let poolPromise: Promise<Pool> | null = null;
let cleanupHandlersRegistered = false;

function registerPoolCleanup(pool: Pool) {
  if (cleanupHandlersRegistered) return;
  cleanupHandlersRegistered = true;

  let shutdownStarted = false;

  const shutdown = (signal: string) => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    pool.end().catch((err) => {
      console.warn("pg_pool_end_failed", { signal, error: String(err) });
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

async function createPool(): Promise<Pool> {
  const url = new URL(CONFIG.SUPABASE_DB_URL);
  const host = url.hostname;

  try {
    const addrs = await dns.resolve4(host);
    if (addrs && addrs.length > 0) {
      url.hostname = addrs[0];
    }
  } catch (err) {
    console.warn("pg_dns_resolve_fallback", { host, error: String(err) });
  }

  const pool = new Pool({
    connectionString: url.toString(),
    max: 5,
    // Intentional for Supabase Session Pooler/pgBouncer TLS chains in managed envs.
    ssl: { rejectUnauthorized: false },
  });

  registerPoolCleanup(pool);
  return pool;
}

export async function getDb(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = createPool();
  }
  return poolPromise;
}
