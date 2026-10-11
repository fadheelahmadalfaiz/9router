// Windows-only build wrapper.
//
// @vercel/nft statically evaluates fs.readdir/readFile calls in the OAuth
// auto-import routes (kiro/cursor) whose paths derive from homedir(), then
// globs the REAL user profile during "Creating an optimized production build".
// Windows junctions inside the profile (e.g. "Application Data") throw
// EPERM when scanned, which aborts the build.
//
// Fix: redirect USERPROFILE/HOME to an empty temp dir for the build process.
// nft then globs nothing, junctions are never touched, and the runtime server
// (which reads the real profile for tokens) is unaffected because the env
// override lives only in this child process.
//
// Escape hatch: set NEXT_BUILD_KEEP_USERPROFILE=1 to skip the redirect.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

if (process.platform === "win32" && !process.env.NEXT_BUILD_KEEP_USERPROFILE) {
  const fakeHome = join(tmpdir(), "9router-fakehome");
  mkdirSync(fakeHome, { recursive: true });
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;
}

const result = spawnSync(
  process.execPath,
  [
    join(root, "node_modules", "next", "dist", "bin", "next"),
    "build",
    "--webpack",
  ],
  { cwd: root, stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
