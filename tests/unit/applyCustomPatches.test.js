import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/apply-custom-patches.mjs");

const providerRouteWithGuards = `export async function POST() {
  if (isOpenAICompatibleProvider(provider)) {
      const existingConnections = await getProviderConnections({ provider });
      if (existingConnections.length > 0) {
        return NextResponse.json({ error: "Only one connection is allowed for this OpenAI Compatible node" }, { status: 400 });
      }
    providerSpecificData = { nodeName: "OpenAI" };
  } else if (isAnthropicCompatibleProvider(provider)) {
      const existingConnections = await getProviderConnections({ provider });
      if (existingConnections.length > 0) {
        return NextResponse.json({ error: "Only one connection is allowed for this Anthropic Compatible node" }, { status: 400 });
      }
    providerSpecificData = { nodeName: "Anthropic" };
  }
}
`;

const providerPageAnchor = `"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import ModelRow from "./ModelRow";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ProviderDetailPage() {
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);

  const getNonCompatibleLlmModelRows = () => {
    const allModels = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
    const disabledSet = new Set(disabledModelIds);
    const displayModels = allModels.filter((m) => !disabledSet.has(m.id));
    const disabledDisplayModels = allModels.filter((m) => disabledSet.has(m.id));
    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });

    return { displayModels, disabledDisplayModels, customModelRows };
  };

  const handleTestModel = async (modelId) => {
    if (testingModelIds.has(modelId)) return;
    setTestingModelIds((prev) => new Set(prev).add(modelId));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: \`\${providerStorageAlias}/\${modelId}\` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setModelsTestError(data.ok ? "" : (data.error || "Model not reachable"));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setModelsTestError("Network error");
    } finally {
      setTestingModelIds((prev) => { const n = new Set(prev); n.delete(modelId); return n; });
    }
  };

  const renderModelsSection = () => {
    const { displayModels, disabledDisplayModels, customModelRows } = getNonCompatibleLlmModelRows();

    return (
      <div className="flex flex-wrap gap-3">
        {customModelRows.map((model) => (
          <ModelRow
            key={model.fullModel}
            model={{ id: model.id, name: model.name }}
            fullModel={model.fullModel}
            copied={copied}
            onCopy={copy}
            testStatus={modelTestResults[model.id]}
            onTest={() => handleTestModel(model.id)}
            isTesting={testingModelIds.has(model.id)}
            isCustom
            isFree={false}
          />
        ))}

        {displayModels.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            fullModel={model.id}
            copied={copied}
            onCopy={copy}
            testStatus={modelTestResults[model.id]}
            onTest={() => handleTestModel(model.id)}
            isTesting={testingModelIds.has(model.id)}
            isFree={model.isFree}
          />
        ))}

        {disabledDisplayModels.length > 0 && <p>Disabled</p>}
      </div>
    );
  };

  if (loading) return null;

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            {"Available Models"}
          </h2>
          {!isCompatible && (() => {
            const { displayModels } = getNonCompatibleLlmModelRows();
            const activeIds = displayModels.map((model) => model.id);
            return (
              <div className="flex flex-wrap gap-2">
                {activeIds.length > 0 && <Button>Disable All</Button>}
              </div>
            );
          })()}
        </div>
        {!!modelsTestError && (
          <p className="text-xs text-red-500 mb-3 break-words">{modelsTestError}</p>
        )}
        {renderModelsSection()}
      </Card>
    </div>
  );
}
`;

const globalsAnchor = `@import "tailwindcss";

/* ============================================================
   9Router palette - upstream orange
   ============================================================ */
:root {
  --color-brand-500: #E56A4A;
  --color-primary: var(--color-brand-500);
}

.dark {
  --color-brand-500: #E56A4A;
  --color-primary: #E56A4A;
}

body { color: var(--color-primary); }
`;

const modelRowAnchor = `import PropTypes from "prop-types";

export default function ModelRow({ model, fullModel, copied, onCopy, onTest, isTesting }) {
  return (
    <button
      onClick={onTest}
      disabled={isTesting}
    >
      Test
    </button>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
};
`;

async function writeFile(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function readFile(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

async function createFixture(overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "apply-custom-patches-"));

  const files = {
    "src/app/api/providers/route.js": providerRouteWithGuards,
    "src/shared/constants/config.js": "export const APP_CONFIG = { name: \"9Router\" };\n",
    "src/shared/constants/colors.js": "export const COLORS = {};\n",
    "src/app/globals.css": globalsAnchor,
    "src/app/(dashboard)/dashboard/providers/[id]/page.js": providerPageAnchor,
    "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js": modelRowAnchor,
    ".github/workflows/sync-upstream.yml": "            git add src/app/api/providers/route.js scripts/apply-custom-patches.mjs .github/workflows/sync-upstream.yml\n",
    ...overrides,
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    await writeFile(root, relativePath, contents);
  }

  return root;
}

async function runScript(cwd) {
  return execFileAsync(process.execPath, [scriptPath], { cwd });
}

describe("apply-custom-patches", () => {
  it("removes compatible provider guards and regenerates local customizations", async () => {
    const root = await createFixture();

    await runScript(root);

    const providerRoute = await readFile(root, "src/app/api/providers/route.js");
    expect(providerRoute).not.toContain("Only one connection is allowed for this OpenAI Compatible node");
    expect(providerRoute).not.toContain("Only one connection is allowed for this Anthropic Compatible node");

    await expect(readFile(root, "src/shared/constants/config.js")).resolves.toContain('name: "IzRouter Proxy"');
    await expect(readFile(root, "src/shared/constants/colors.js")).resolves.toContain("#c4bf1f");
    await expect(readFile(root, "src/app/globals.css")).resolves.toContain("--color-brand-500: #c4bf1f;");
    await expect(readFile(root, "src/shared/utils/serialModelTests.js")).resolves.toContain("runSerialModelTests");
    await expect(readFile(root, "tests/unit/serialModelTests.test.js")).resolves.toContain("runs model tests in input order");

    const providerPage = await readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/page.js");
    expect(providerPage).toContain("runSerialModelTests");
    expect(providerPage).toContain("autoTestingModels");
    expect(providerPage).toContain("handleAutoTestAvailableModels");
    expect(providerPage).toContain("Auto Test All");
    expect(providerPage).toContain("isTestDisabled={autoTestingModels}");

    const modelRow = await readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js");
    expect(modelRow).toContain("isTestDisabled");
    expect(modelRow).toContain("disabled={isTesting || isTestDisabled}");
  });

  it("is idempotent when run twice", async () => {
    const root = await createFixture();

    await runScript(root);
    const firstSnapshot = await Promise.all([
      readFile(root, "src/app/api/providers/route.js"),
      readFile(root, "src/shared/constants/config.js"),
      readFile(root, "src/shared/constants/colors.js"),
      readFile(root, "src/app/globals.css"),
      readFile(root, "src/shared/utils/serialModelTests.js"),
      readFile(root, "tests/unit/serialModelTests.test.js"),
      readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/page.js"),
      readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js"),
    ]);

    await runScript(root);
    const secondSnapshot = await Promise.all([
      readFile(root, "src/app/api/providers/route.js"),
      readFile(root, "src/shared/constants/config.js"),
      readFile(root, "src/shared/constants/colors.js"),
      readFile(root, "src/app/globals.css"),
      readFile(root, "src/shared/utils/serialModelTests.js"),
      readFile(root, "tests/unit/serialModelTests.test.js"),
      readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/page.js"),
      readFile(root, "src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js"),
    ]);

    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  it("fails fast when a required upstream anchor is missing", async () => {
    const root = await createFixture({
      "src/app/(dashboard)/dashboard/providers/[id]/page.js": "export default function ProviderDetailPage() { return null; }\n",
    });

    await expect(runScript(root)).rejects.toMatchObject({ code: 1 });
  });

  it("stages every regenerated file in the sync workflow", async () => {
    const root = await createFixture();

    await runScript(root);

    const workflow = await readFile(root, ".github/workflows/sync-upstream.yml");
    expect(workflow).toContain("src/shared/constants/config.js");
    expect(workflow).toContain("src/shared/constants/colors.js");
    expect(workflow).toContain("src/app/globals.css");
    expect(workflow).toContain("src/shared/utils/serialModelTests.js");
    expect(workflow).toContain("tests/unit/serialModelTests.test.js");
    expect(workflow).toContain("'src/app/(dashboard)/dashboard/providers/[id]/page.js'");
    expect(workflow).toContain("'src/app/(dashboard)/dashboard/providers/[id]/ModelRow.js'");
  });
});
