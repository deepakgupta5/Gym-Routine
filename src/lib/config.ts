export const CONFIG = {
  SUPABASE_DB_URL: process.env.SUPABASE_DB_URL || "",
  SINGLE_USER_ID: process.env.SINGLE_USER_ID || "",
  APP_PASSCODE_HASH: process.env.APP_PASSCODE_HASH || "",
  COOKIE_SIGNING_SECRET: process.env.COOKIE_SIGNING_SECRET || "",
  ADMIN_SECRET: process.env.ADMIN_SECRET || "",
  // NOT in requireConfig() - nutrition degrades gracefully to manual mode without this key.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  // v2 scheduler feature flag. Set GYM_V2_ENABLED=true in Netlify env to activate.
  // Default off: v1 scheduler runs until explicitly enabled.
  GYM_V2_ENABLED: process.env.GYM_V2_ENABLED === "true",
};

type RequireConfigOptions = {
  openai?: boolean;
};

export function requireConfig(options: RequireConfigOptions = {}) {
  const requiredKeys: Array<keyof typeof CONFIG> = [
    "SUPABASE_DB_URL",
    "SINGLE_USER_ID",
    "APP_PASSCODE_HASH",
    "COOKIE_SIGNING_SECRET",
    "ADMIN_SECRET",
  ];

  if (options.openai) {
    requiredKeys.push("OPENAI_API_KEY");
  }

  const missing = requiredKeys.filter((key) => !CONFIG[key]);

  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}
