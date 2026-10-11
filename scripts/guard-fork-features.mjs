#!/usr/bin/env node
/**
 * guard-fork-features.mjs — keep the MIBP fork a true UNION after an upstream merge.
 *
 * WHY THIS EXISTS
 * ---------------
 * `sync-mibp` is the union of two upstreams:
 *   - mhiqrambg/9router-mibp-version@master  (fork base; carries fork features)
 *   - decolua/9router@master                 (original upstream; carries new features)
 *
 * The hourly workflow merges the fork base first (-X ours) and decolua second
 * (-X theirs). For files BOTH sides edited, `-X theirs` takes decolua's WHOLE
 * blob, silently dropping fork-only additions in that file. A naive merge still
 * exits 0 with no conflict markers — so nothing fails, and the fork feature just
 * disappears.
 *
 * This script re-inserts each known fork-only snippet when it is missing. It is
 * deliberately LINE-LEVEL (not whole-file restore) so decolua's new additions in
 * the same file survive too.
 *
 * USAGE
 *   node scripts/guard-fork-features.mjs            # patch in place, exit 0
 *   node scripts/guard-fork-features.mjs --check    # report only; exit 1 if missing
 *
 * Exit codes: 0 = all present (or successfully re-inserted), 1 = missing anchor
 * that could not be repaired (fail loud — never push a broken union).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");

/**
 * Each guard is a file with one or more "parts". Every part describes a snippet
 * that MUST be present. When it is missing, the part is re-inserted after its
 * anchor line. `-X theirs` merges can drop a snippet while leaving code that
 * depends on it (e.g. a `useState` declaration gone but its JSX kept), so parts
 * are checked independently and repaired independently.
 *
 * Part fields:
 *   label        human-readable description
 *   requires     substrings; the part is satisfied if ANY is present
 *   snippet      lines to insert when missing
 *   insertAfter  anchor line; snippet goes right after the first matching line
 *   noBlankBefore  default false (blank line separates); true for arrays/imports
 *   matchIndent    copy the anchor line's leading whitespace onto the snippet
 */
const GUARDS = [
  {
    file: "src/lib/oauth/constants/oauth.js",
    parts: [
      {
        label: "FREEBUFF_CONFIG export",
        requires: ["FREEBUFF_CONFIG"],
        snippet: [
          "// Freebuff OAuth Configuration (Device Code Flow)",
          'export const FREEBUFF_CONFIG = { ...PROVIDER_OAUTH["freebuff"] };',
        ],
        // fork keeps freebuff right after the grok-cli config line
        insertAfter: 'export const GROK_CLI_CONFIG = { ...PROVIDER_OAUTH["grok-cli"] };',
      },
    ],
  },
  {
    file: "src/app/api/oauth/[provider]/[action]/route.js",
    parts: [
      {
        label: "freebuff in OAuth provider route list",
        requires: ["freebuff"],
        snippet: ['"freebuff",'],
        insertAfter: '"grok-cli",',
        noBlankBefore: true,
        matchIndent: true,
      },
    ],
  },
  {
    file: "src/shared/components/Header.js",
    parts: [
      {
        label: "DonateModal import (decolua donation UI)",
        requires: ["DonateModal"],
        snippet: ['import DonateModal from "@/shared/components/DonateModal";'],
        insertAfter: 'import ThemeToggle from "@/shared/components/ThemeToggle";',
        noBlankBefore: true,
      },
      {
        // Consistency guard: if the donate JSX survives but its state hook was
        // dropped by the merge, the file will not compile. Re-add the hook.
        label: "donateOpen state hook",
        requires: ["const [donateOpen, setDonateOpen] = useState"],
        snippet: ["const [donateOpen, setDonateOpen] = useState(false);"],
        insertAfter: 'const [loginMethod, setLoginMethod] = useState("");',
        noBlankBefore: true,
        matchIndent: true,
      },
      {
        label: "DonateModal render element",
        requires: ["<DonateModal isOpen={donateOpen}"],
        snippet: [
          "      <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />",
        ],
        // Insert just before the closing </header> so it sits as the last child.
        insertBeforeAnchor: "</header>",
        noBlankBefore: true,
        matchIndent: false,
      },
    ],
  },
];

function readFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return { abs, text: fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n") };
}

function writeFile(abs, text) {
  fs.writeFileSync(abs, text);
}

function hasAny(text, needles) {
  return needles.some((n) => text.includes(n));
}

function insertAfterLine(text, anchorLine, snippetLines, noBlankBefore = false, matchIndent = false) {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim() === anchorLine.trim());
  if (idx === -1) return null;
  let block = [...snippetLines];
  if (matchIndent) {
    const indent = lines[idx].match(/^\s*/)[0];
    block = block.map((l) => (l.trim() ? indent + l.trim() : l));
  }
  if (!noBlankBefore) block = ["", ...block];
  lines.splice(idx + 1, 0, ...block);
  return lines.join("\n");
}

function insertBeforeLine(text, anchorLine, snippetLines, noBlankBefore = false, matchIndent = false) {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim() === anchorLine.trim());
  if (idx === -1) return null;
  let block = [...snippetLines];
  if (matchIndent) {
    const indent = lines[idx].match(/^\s*/)[0];
    block = block.map((l) => (l.trim() ? indent + l.trim() : l));
  }
  if (!noBlankBefore) block = [...block, ""];
  lines.splice(idx, 0, ...block);
  return lines.join("\n");
}

let failed = 0;
let patched = 0;

for (const g of GUARDS) {
  const f = readFile(g.file);
  if (!f) {
    console.error(`::error::guard: file missing: ${g.file}`);
    failed++;
    continue;
  }
  let text = f.text;
  let filePatched = false;

  for (const part of g.parts) {
    if (hasAny(text, part.requires)) {
      console.log(`OK    ${g.file}: ${part.label}`);
      continue;
    }
    if (CHECK_ONLY) {
      console.error(`::error::guard(MISSING) ${g.file}: ${part.label}`);
      failed++;
      continue;
    }
    let repaired = null;
    if (part.insertBeforeAnchor) {
      repaired = insertBeforeLine(
        text,
        part.insertBeforeAnchor,
        part.snippet,
        part.noBlankBefore,
        part.matchIndent,
      );
    } else {
      repaired = insertAfterLine(
        text,
        part.insertAfter,
        part.snippet,
        part.noBlankBefore,
        part.matchIndent,
      );
    }
    // If the anchor line itself is gone, fall back to appending at file end.
    if (repaired === null) {
      repaired = text.replace(/\n?$/, "\n") + "\n" + part.snippet.join("\n") + "\n";
    }
    if (repaired === null || !hasAny(repaired, part.requires)) {
      console.error(`::error::guard(UNREPAIRABLE) ${g.file}: ${part.label}`);
      failed++;
      continue;
    }
    text = repaired;
    filePatched = true;
    console.log(`FIXED ${g.file}: re-inserted ${part.label}`);
  }

  if (filePatched) {
    writeFile(f.abs, text);
    patched++;
  }
}

if (failed > 0) {
  console.error(`\nguard-fork-features: ${failed} fork feature(s) missing and not repaired.`);
  process.exit(1);
}
console.log(`\nguard-fork-features: all fork features present${patched ? ` (${patched} files repaired)` : ""}.`);
