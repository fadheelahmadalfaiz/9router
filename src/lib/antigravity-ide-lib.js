import { NextResponse } from "next/server";

const TARGETS = {
  "antigravity-app": {
    id: "antigravity-app",
    route: "/api/antigravity-app",
    displayName: "Antigravity App",
    installPaths: {
      darwin: ["/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"],
      win32: [
        "%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd",
        "%LOCALAPPDATA%\\Programs\\AGY\\resources\\app\\bin\\agy.cmd",
        "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe",
        "%LOCALAPPDATA%\\Programs\\AGY\\AGY.exe",
        "%ProgramFiles%\\Antigravity\\Antigravity.exe",
        "%ProgramFiles%\\AGY\\AGY.exe",
      ],
      linux: [],
    },
    installCandidates: {
      win32: [
        { binary: "%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd" },
        { binary: "%LOCALAPPDATA%\\Programs\\AGY\\resources\\app\\bin\\agy.cmd" },
        {
          binary: "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe",
          all: ["%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd"],
          none: ["%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app.asar"],
        },
        {
          binary: "%LOCALAPPDATA%\\Programs\\AGY\\AGY.exe",
          all: ["%LOCALAPPDATA%\\Programs\\AGY\\resources\\app\\bin\\agy.cmd"],
          none: ["%LOCALAPPDATA%\\Programs\\AGY\\resources\\app.asar"],
        },
      ],
    },
  },
  "antigravity-app-v2": {
    id: "antigravity-app-v2",
    route: "/api/antigravity-app-v2",
    displayName: "Antigravity App v2",
    installPaths: {
      darwin: ["/Applications/Antigravity.app/Contents/MacOS/Antigravity"],
      win32: [
        "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe",
        "%ProgramFiles%\\Antigravity\\Antigravity.exe",
      ],
      linux: [],
    },
    installCandidates: {
      win32: [
        {
          binary: "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe",
          all: ["%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app.asar"],
          none: ["%LOCALAPPDATA%\\Programs\\Antigravity\\resources\\app\\bin\\antigravity.cmd"],
        },
        {
          binary: "%ProgramFiles%\\Antigravity\\Antigravity.exe",
          all: ["%ProgramFiles%\\Antigravity\\resources\\app.asar"],
          none: ["%ProgramFiles%\\Antigravity\\resources\\app\\bin\\antigravity.cmd"],
        },
      ],
    },
    pathRequirements: {
      darwin: {
        all: ["/Applications/Antigravity.app/Contents/Resources/app.asar"],
        none: ["/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"],
      },
    },
  },
  "antigravity-ide": {
    id: "antigravity-ide",
    route: "/api/antigravity-ide",
    displayName: "Antigravity IDE",
    installPaths: {
      darwin: ["/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"],
      win32: [
        "%LOCALAPPDATA%\\Programs\\Antigravity IDE\\Antigravity IDE.exe",
        "%LOCALAPPDATA%\\Programs\\Antigravity IDE\\antigravity-ide.exe",
        "%ProgramFiles%\\Antigravity IDE\\Antigravity IDE.exe",
        "%ProgramFiles%\\Antigravity IDE\\antigravity-ide.exe",
      ],
      linux: [],
    },
  },
};

function publicTarget(target, detection) {
  return {
    id: target.id,
    route: target.route,
    displayName: target.displayName,
    installed: detection.installed,
    binary: detection.binary,
  };
}

export function getAntigravityTarget(id) {
  const target = TARGETS[id];
  if (!target) throw new Error(`Unknown Antigravity target: ${id}`);
  return target;
}

export function listAntigravityTargets() {
  return Object.values(TARGETS).map((target) => ({
    id: target.id,
    route: target.route,
    displayName: target.displayName,
  }));
}

function resolveEnvPath(candidatePath, env = process.env) {
  return candidatePath.replace(/%([^%]+)%/g, (_, key) => env[key] || "");
}

function matchesCandidateRequirements(candidate, existsSync, env) {
  for (const requiredPath of candidate.all || []) {
    if (!existsSync(resolveEnvPath(requiredPath, env))) return false;
  }

  for (const forbiddenPath of candidate.none || []) {
    if (existsSync(resolveEnvPath(forbiddenPath, env))) return false;
  }

  return true;
}

function matchesPathRequirements(target, platform, existsSync, env) {
  const requirements = target.pathRequirements?.[platform];
  return requirements ? matchesCandidateRequirements(requirements, existsSync, env) : true;
}

export function detectAntigravityInstallation(target, options = {}) {
  const platform = options.platform || process.platform;
  const existsSync = options.existsSync || (() => false);
  const env = options.env || process.env;

  if (!matchesPathRequirements(target, platform, existsSync, env)) {
    return { installed: false, binary: null };
  }

  const candidates = target.installCandidates?.[platform] || [];
  for (const candidate of candidates) {
    if (!matchesCandidateRequirements(candidate, existsSync, env)) continue;
    const binary = resolveEnvPath(candidate.binary, env);
    if (binary && existsSync(binary)) return { installed: true, binary };
  }

  if (candidates.length > 0) return { installed: false, binary: null };

  for (const installPath of target.installPaths?.[platform] || []) {
    const binary = resolveEnvPath(installPath, env);
    if (binary && existsSync(binary)) return { installed: true, binary };
  }

  return { installed: false, binary: null };
}

export function getAntigravityTargetStatus(id) {
  const target = getAntigravityTarget(id);
  return publicTarget(target, detectAntigravityInstallation(target));
}

export function handleAntigravityTargetGet(id) {
  return NextResponse.json(getAntigravityTargetStatus(id));
}

export function handleAntigravityTargetsGet() {
  const targets = Object.values(TARGETS).map((target) => publicTarget(target, detectAntigravityInstallation(target)));
  return NextResponse.json({ targets });
}
