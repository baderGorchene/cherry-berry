import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters")
    .refine((s) => !s.startsWith("change-me"), "replace the example value (e.g. openssl rand -base64 32)"),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Set when behind a reverse proxy: "true", a hop count, or trusted CIDRs/IPs (comma-separated).
  TRUST_PROXY: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // "memory:" keeps uploads in process memory (tests, e2e); otherwise an S3-compatible URL.
  S3_ENDPOINT: z.string().min(1, 'set a URL, or "memory:" for throwaway in-memory storage'),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  S3_REGION: z.string().default("us-east-1"),
}).superRefine((e, ctx) => {
  if (e.S3_ENDPOINT === "memory:") return;
  for (const k of ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
    if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: 'required unless S3_ENDPOINT is "memory:"' });
  }
});

export type Config = {
  databaseUrl: string; authSecret: string; publicUrl: string; port: number;
  trustProxy: boolean | number | string; logLevel: string;
  s3: { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string };
};

export function loadConfig(env: Record<string, string | undefined>): Config {
  const r = Env.safeParse(env);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = r.data;
  return {
    databaseUrl: e.DATABASE_URL, authSecret: e.AUTH_SECRET, publicUrl: e.PUBLIC_URL, port: e.PORT,
    trustProxy: parseTrustProxy(e.TRUST_PROXY), logLevel: e.LOG_LEVEL,
    s3: { endpoint: e.S3_ENDPOINT, bucket: e.S3_BUCKET, accessKey: e.S3_ACCESS_KEY, secretKey: e.S3_SECRET_KEY, region: e.S3_REGION },
  };
}

function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (!v || v === "false") return false;
  if (v === "true") return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}
