#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const providersRoute = path.join(root, 'src/app/api/providers/route.js');

function replaceAllLiteral(input, search, replacement) {
  return input.split(search).join(replacement);
}

function removeCompatibleSingleConnectionLimits(source) {
  let out = source;

  // Older upstream versions had explicit single-connection guards for compatible nodes.
  // Keep this patch idempotent so custom-patch can be regenerated from master every hour.
  const guards = [
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this OpenAI Compatible node" }, { status: 400 });\n      }\n`,
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Anthropic Compatible node" }, { status: 400 });\n      }\n`,
    // Historical patch removed this too; keep it here in case upstream reintroduces it.
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Custom Embedding node" }, { status: 400 });\n      }\n`,
    // Broken intermediate state from the original manual patch; safe no-op on current code.
    `      const existingConnections = await getProviderConnections({ provider });\n      if (existingConnections.length > 0) {\n        return NextResponse.json({ error: "Only one connection is allowed for this Custom Embedding node" }, { status: 400 });\n      }\n      }\n`,
  ];

  for (const guard of guards) out = replaceAllLiteral(out, guard, '');
  return out;
}

if (!fs.existsSync(providersRoute)) {
  console.error(`Missing expected file: ${providersRoute}`);
  process.exit(1);
}

const before = fs.readFileSync(providersRoute, 'utf8');
const after = removeCompatibleSingleConnectionLimits(before);

if (after !== before) {
  fs.writeFileSync(providersRoute, after);
  console.log('Applied custom patch: removed compatible provider single-connection limits.');
} else {
  console.log('Custom patch already applied / not needed on this upstream version.');
}

// Do not eval the route file here: it is an ES module with Next.js imports.
// Build/CI is the real syntax/integration check.
console.log('Patch script finished. Build/CI will validate the Next.js route.');
