import { cookies } from "next/headers";
import { execute, queryOne } from "@/lib/db";
import {
  DEFAULT_THEME_ID,
  THEME_COOKIE,
  getTheme,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";
import { MAINTENANCE_COOKIE } from "@/lib/maintenanceCookie";

export { MAINTENANCE_COOKIE };

const THEME_SETTING_KEY = "theme_id";
const MAINTENANCE_SETTING_KEY = "maintenance_mode";

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
      [THEME_SETTING_KEY]
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
    [THEME_SETTING_KEY, themeId]
  );
}

export async function getThemeForRequest() {
  const id = await getStoredThemeId();
  return getTheme(id);
}

/** Env override wins (MAINTENANCE_MODE=1|true|on). */
function envMaintenanceForced(): boolean | null {
  const raw = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return null;
}

export async function isMaintenanceMode(): Promise<boolean> {
  const forced = envMaintenanceForced();
  if (forced != null) return forced;

  try {
    await ensureSettingsTable();
    const row = await queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = ?",
      [MAINTENANCE_SETTING_KEY]
    );
    return row?.setting_value === "1";
  } catch {
    return false;
  }
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await ensureSettingsTable();
  await execute(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [MAINTENANCE_SETTING_KEY, enabled ? "1" : "0"]
  );
}
