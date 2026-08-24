import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().default("file:./data/english-study.sqlite"),
  CONTENT_DIR: z.string().default("./content-private"),
  RECORDINGS_DIR: z.string().default("./recordings"),
  READING_DIR: z.string().default("./reading-data"),
  READING_ENABLED: z.enum(["true", "false"]).default("true"),
  READING_UPLOAD_ENABLED: z.enum(["true", "false"]).default("true"),
  READING_MAX_BOOK_BYTES: z.coerce.number().int().positive().default(300 * 1024 * 1024),
  READING_MAX_USER_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024 * 1024),
  READING_MAX_USER_BOOKS: z.coerce.number().int().positive().default(100),
  READING_TRANSLATION_DAILY_LIMIT: z.coerce.number().int().positive().default(100),
  TRANSLATION_BASE_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  TRANSLATION_API_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().optional()),
  TRANSLATION_MODEL: z.string().default("translation-model"),
  COURSE_LESSON_COUNT: z.coerce.number().int().min(1).max(40).default(40),
  SESSION_COOKIE_NAME: z.string().default("zhuguang_session"),
  SESSION_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SESSION_SECRET: z.string().min(32),
  BOOTSTRAP_ADMIN_USERNAME: z.string().min(3).optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).optional(),
});

type ParsedConfig = z.infer<typeof configSchema>;
export type AppConfig = Omit<ParsedConfig, "SESSION_COOKIE_SECURE" | "READING_ENABLED" | "READING_UPLOAD_ENABLED"> & {
  SESSION_COOKIE_SECURE: boolean;
  READING_ENABLED: boolean;
  READING_UPLOAD_ENABLED: boolean;
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  return {
    ...parsed,
    SESSION_COOKIE_SECURE:
      parsed.SESSION_COOKIE_SECURE === undefined
        ? parsed.NODE_ENV === "production"
        : parsed.SESSION_COOKIE_SECURE === "true",
    READING_ENABLED: parsed.READING_ENABLED === "true",
    READING_UPLOAD_ENABLED: parsed.READING_UPLOAD_ENABLED === "true",
  };
}
