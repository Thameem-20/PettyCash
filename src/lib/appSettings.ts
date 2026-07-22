import { cookies } from "next/headers";
import { execute, queryOne } from "@/lib/db";
import {
  DEFAULT_THEME_ID,
  THEME_COOKIE,
  getTheme,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

const SETTING_KEY = "theme_id";

async function ensureSettingsTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function getStoredThemeId(): Promise<ThemeId> {
  try {
    await ensureSettingsTable();
    const row = await queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = ?",
      [SETTING_KEY]
    );
    if (row && isThemeId(row.setting_value)) return row.setting_value;
  } catch {
    // DB unavailable — fall through to cookie / default
  }

  const cookieStore = cookies();
  const fromCookie = cookieStore.get(THEME_COOKIE)?.value;
  if (isThemeId(fromCookie)) return fromCookie;
  return DEFAULT_THEME_ID;
}

export async function setStoredThemeId(themeId: ThemeId): Promise<void> {
  if (!isThemeId(themeId)) throw new Error("Invalid theme");
  await ensureSettingsTable();
  await execute(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SETTING_KEY, themeId]
  );
}

export async function getThemeForRequest() {
  const id = await getStoredThemeId();
  return getTheme(id);
}
