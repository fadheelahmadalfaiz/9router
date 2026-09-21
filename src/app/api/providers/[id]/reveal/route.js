import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import { verifyDashboardAuthToken, verifyDashboardPassword } from "@/lib/auth/dashboardSession";
import { getClientIp } from "@/lib/auth/loginLimiter";
import { getDataDir } from "@/lib/dataDir";

// Per-IP cooldown so a wrong password does not turn into a brute-force vector.
// Separate from loginLimiter so revealing credentials never locks the dashboard
// login itself.
const REVEAL_COOLDOWN_MS = 30_000;
const REVEAL_MAX_FAILS = 3;
const cooldowns = new Map(); // ip -> { fails, lockUntil }

function checkRevealCooldown(ip) {
  const e = cooldowns.get(ip);
  if (!e) return { locked: false };
  if (e.lockUntil && Date.now() < e.lockUntil) {
    return { locked: true, retryAfter: Math.ceil((e.lockUntil - Date.now()) / 1000) };
  }
  if (e.lockUntil && Date.now() >= e.lockUntil) cooldowns.delete(ip);
  return { locked: false };
}

function recordRevealFail(ip) {
  const e = cooldowns.get(ip) || { fails: 0, lockUntil: 0 };
  e.fails += 1;
  if (e.fails >= REVEAL_MAX_FAILS) {
    e.lockUntil = Date.now() + REVEAL_COOLDOWN_MS;
    e.fails = 0;
  }
  cooldowns.set(ip, e);
  return Math.max(0, REVEAL_MAX_FAILS - e.fails);
}

function clearRevealCooldown(ip) {
  cooldowns.delete(ip);
}

function appendAudit(entry) {
  try {
    const dir = getDataDir();
    const line = JSON.stringify(entry) + "\n";
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "credential-reveals.log"), line, { mode: 0o600 });
  } catch {
    // best effort — failing to write an audit row must not break the request,
    // but it should be loud so an operator notices.
    console.warn("[credential-reveal] failed to write audit log");
  }
}

// POST /api/providers/[id]/reveal
// Re-authenticated reveal of a single connection's secret. The plaintext key
// is returned exactly once; the UI MUST NOT keep it in React state beyond the
// brief window it needs to copy.
export async function POST(request, { params }) {
  const ip = getClientIp(request);
  let auditContext = { connectionId: undefined, provider: undefined, ip };

  try {
    // 1) Dashboard session is required first. Without it, password is meaningless
    //    (would let a random unauthenticated visitor brute-force the dashboard).
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    const sessionValid = await verifyDashboardAuthToken(token);
    if (!sessionValid) {
      appendAudit({ ...auditContext, action: "reveal", result: "rejected", reason: "no_session", at: new Date().toISOString() });
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2) Per-IP cooldown — separate from login lockout so reveals cannot
    //    accidentally lock the user out of their own dashboard.
    const cooldown = checkRevealCooldown(ip);
    if (cooldown.locked) {
      appendAudit({ ...auditContext, action: "reveal", result: "rejected", reason: "cooldown", retryAfter: cooldown.retryAfter, at: new Date().toISOString() });
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${cooldown.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(cooldown.retryAfter) } }
      );
    }

    const { id } = await params;
    auditContext.connectionId = id;
    const body = await request.json().catch(() => ({}));
    const { password } = body || {};

    if (typeof password !== "string" || !password) {
      appendAudit({ ...auditContext, action: "reveal", result: "rejected", reason: "missing_password", at: new Date().toISOString() });
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // 3) Load the connection BEFORE we verify the password, so we can include
    //    the provider name in the audit row (success or failure). 404s still get
    //    logged but without a provider field.
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      appendAudit({ ...auditContext, action: "reveal", result: "rejected", reason: "not_found", at: new Date().toISOString() });
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    auditContext.provider = connection.provider;

    // 4) Re-authenticate. Same verification the login route uses.
    const passwordValid = await verifyDashboardPassword(password);
    if (!passwordValid) {
      const remaining = recordRevealFail(ip);
      appendAudit({ ...auditContext, action: "reveal", result: "rejected", reason: "bad_password", remaining, at: new Date().toISOString() });
      return NextResponse.json(
        { error: "Wrong password.", remainingBeforeLock: remaining },
        { status: 401 }
      );
    }
    clearRevealCooldown(ip);

    // 5) Hand back exactly one secret field. We deliberately do NOT return
    //    refresh/id tokens here — those are managed by the OAuth refresh flow
    //    and exposing them would let a leaked dashboard session escalate into
    //    a stolen session at the upstream provider.
    let secretField = null;
    let secretValue = null;
    if (connection.authType === "cookie" && connection.accessToken) {
      secretField = "accessToken";
      secretValue = connection.accessToken;
    } else if (connection.authType === "apikey" && connection.apiKey) {
      secretField = "apiKey";
      secretValue = connection.apiKey;
    }

    appendAudit({ ...auditContext, action: "reveal", result: "success", field: secretField, at: new Date().toISOString() });

    if (!secretValue) {
      return NextResponse.json({ error: "No secret stored for this connection" }, { status: 404 });
    }

    return NextResponse.json({
      field: secretField,
      value: secretValue,
      provider: connection.provider,
      name: connection.name,
    });
  } catch (error) {
    appendAudit({ ...auditContext, action: "reveal", result: "error", error: String(error?.message || error), at: new Date().toISOString() });
    console.error("[credential-reveal] error", error);
    return NextResponse.json({ error: "Failed to reveal credential" }, { status: 500 });
  }
}
