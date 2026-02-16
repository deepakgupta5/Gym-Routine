export const CONFIG = {
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL || "",
  SINGLE_USER_ID: process.env.SINGLE_USER_ID || "",
  APP_PASSCODE_HASH: process.env.APP_PASSCODE_HASH || "",
  COOKIE_SIGNING_SECRET: process.env.COOKIE_SIGNING_SECRET || "",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "",
};

export function requireConfig() {
  const missing = Object.entries(CONFIG)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}
