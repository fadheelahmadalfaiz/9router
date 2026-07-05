import fs from "fs";
import path from "path";
import os from "os";
import { getProviderConnections, getSettings } from "@/lib/localDb";

const DATA_DIR = process.env.DATA_DIR
  || (process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router")
    : path.join(os.homedir(), ".9router"));

const CACHE_FILE = path.join(DATA_DIR, "mitm", "antigravity-account-pool.json");

function writeAtomic(data) {
  const dir = path.dirname(CACHE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, CACHE_FILE);
}

function snapshotConnection(connection) {
  return {
    id: connection.id,
    provider: connection.provider,
    isActive: connection.isActive,
    authType: connection.authType,
    hasAccessToken: Boolean(connection.accessToken),
    expiresAt: connection.expiresAt,
    rateLimitedUntil: connection.rateLimitedUntil,
    authCooldownUntil: connection.authCooldownUntil,
    modelCooldowns: connection.modelCooldowns,
    lastUsedAt: connection.lastUsedAt,
  };
}

export async function syncAntigravityAccountPoolToJson() {
  try {
    const [settings, connections] = await Promise.all([
      getSettings(),
      getProviderConnections({ provider: "antigravity" }),
    ]);

    writeAtomic({
      settings: {
        antigravityAccountPoolEnabled: settings.antigravityAccountPoolEnabled === true,
        antigravityAccountPoolStrategy: settings.antigravityAccountPoolStrategy || "round-robin",
      },
      accounts: (connections || []).map(snapshotConnection),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log("[antigravityAccountPoolCache] sync failed:", error.message);
  }
}

export function writeAntigravityAccountPoolSnapshot(snapshot) {
  writeAtomic(snapshot || {});
}
