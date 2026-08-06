// Background pool egress geo probe — fills the poolGeo cache so the Proxy
// Fitness / Proxy Pools UI can show each pool's egress IP + country, and
// future provider region policies can pre-mark pools unfit.
// Fail-open everywhere; never blocks startup or requests.

import { getProxyPools } from "@/models";
import { probePoolGeo, setPoolGeo, getPoolGeo } from "open-sse/services/poolGeo.js";
import { isNonServerRuntime } from "@/sse/services/backgroundTokenRefresh.js";

const PROBE_INTERVAL_MS = 30 * 60 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;
const CONCURRENCY = 4;
// Re-probe a pool when its last sample is older than this — multiple samples
// per pool are what let us flag flapping (changing egress) relays.
const GEO_REPROBE_MS = 15 * 60 * 1000;

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let probing = false;

// probe with bounded concurrency; re-probes pools whose sample is stale enough.
async function probeAll() {
  if (probing) return;
  probing = true;
  try {
    const pools = await getProxyPools({ isActive: true });
    const now = Date.now();
    const targets = (pools || []).filter((p) => {
      if (!p?.proxyUrl) return false;
      const geo = getPoolGeo(p.id);
      return !geo || now - geo.ts >= GEO_REPROBE_MS;
    });
    if (targets.length === 0) return;
    console.log(`[PoolEgressProbe] probing ${targets.length}/${(pools || []).length} active pools`);
    let next = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(targets.length, 1)) }, async () => {
      while (next < targets.length) {
        const pool = targets[next++];
        const geo = await probePoolGeo(pool);
        if (geo) setPoolGeo(pool.id, geo);
      }
    });
    await Promise.allSettled(workers);
    const filled = (pools || []).filter((p) => getPoolGeo(p.id)).length;
    console.log(`[PoolEgressProbe] pass done — geo cached for ${filled}/${(pools || []).length} pools`);
  } catch (e) {
    console.log(`[PoolEgressProbe] pass failed: ${e?.message || e}`);
  } finally {
    probing = false;
  }
}

export function startPoolEgressProbe({ intervalMs } = {}) {
  if (started) return false;
  if (isNonServerRuntime()) return false;
  started = true;
  const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : PROBE_INTERVAL_MS;
  console.log("[PoolEgressProbe] Scheduler started", { intervalMs: period, initialDelayMs: INITIAL_DELAY_MS });
  initialTimeoutHandle = setTimeout(() => { probeAll().catch(() => {}); }, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();
  intervalHandle = setInterval(() => { probeAll().catch(() => {}); }, period);
  if (intervalHandle.unref) intervalHandle.unref();
  return true;
}

export function stopPoolEgressProbe() {
  if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  initialTimeoutHandle = null;
  intervalHandle = null;
  started = false;
}

export const __test__ = { probeAll };
