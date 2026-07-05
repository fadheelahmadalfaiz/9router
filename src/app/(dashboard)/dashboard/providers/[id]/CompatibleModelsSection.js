"use client";

import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { runSerialModelTests } from "@/shared/utils/serialModelTests";

function createInitialTestAllProgress() {
  return {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    stopped: false,
    currentModelId: null,
  };
}

function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting, isTestDisabled }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <span
        className="material-symbols-outlined text-base text-text-muted"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>
        <div className="flex items-center gap-1 mt-1">
          <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(fullModel, `model-${modelId}`)}
              className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm">
                {copied === `model-${modelId}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${modelId}` ? "Copied!" : "Copy"}
            </span>
          </div>
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTestDisabled}
                className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-colors"
                aria-label={isTesting ? `Testing ${modelId}` : `Test ${modelId}`}
                title={isTesting ? `Testing ${modelId}` : `Test ${modelId}`}
              >
                <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onDeleteAlias}
        className="p-1 hover:bg-red-50 rounded text-red-500"
        title="Remove model"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onAddCustomModel, onDeleteCustomModel, connections, isAnthropic }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [modelTestResults, setModelTestResults] = useState({});
  const [testAllProgress, setTestAllProgress] = useState(createInitialTestAllProgress);
  const testAllAbortRef = useRef(null);

  const testOneCompatibleModel = async (modelId, { signal } = {}) => {
    const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
        signal,
      });
    return res.json();
  };

  const handleTestModel = async (modelId) => {
    if (testingModelId || isTestingAll) return;
    setTestingModelId(modelId);
    try {
      const data = await testOneCompatibleModel(modelId);
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
    } finally {
      setTestingModelId(null);
    }
  };

  const handleTestAllModels = async () => {
    if (testingModelId || isTestingAll || allModels.length === 0) return;

    const controller = new AbortController();
    testAllAbortRef.current = controller;
    setIsTestingAll(true);
    setTestAllProgress({ ...createInitialTestAllProgress(), total: allModels.length });
    setModelTestResults((prev) => {
      const next = { ...prev };
      for (const model of allModels) {
        delete next[model.id];
      }
      return next;
    });

    try {
      const outcome = await runSerialModelTests(
        allModels,
        (model, options) => testOneCompatibleModel(model.id, options),
        {
          onStart: (model) => {
            setTestingModelId(model.id);
            setTestAllProgress((prev) => ({ ...prev, currentModelId: model.id }));
          },
          onResult: (entry) => {
            setModelTestResults((prev) => ({ ...prev, [entry.id]: entry.status }));
            setTestAllProgress((prev) => ({
              ...prev,
              completed: prev.completed + 1,
              passed: entry.status === "ok" ? prev.passed + 1 : prev.passed,
              failed: entry.status === "error" ? prev.failed + 1 : prev.failed,
            }));
          },
          onCancel: (results) => {
            setTestAllProgress((prev) => ({
              ...prev,
              completed: results.length,
              passed: results.filter((entry) => entry.status === "ok").length,
              failed: results.filter((entry) => entry.status === "error").length,
              stopped: true,
              currentModelId: null,
            }));
          },
        },
        controller.signal,
      );
      if (outcome.status === "complete") {
        setTestAllProgress((prev) => ({ ...prev, currentModelId: null }));
      }
    } finally {
      if (testAllAbortRef.current === controller) {
        testAllAbortRef.current = null;
      }
      setTestingModelId(null);
      setIsTestingAll(false);
    }
  };

  const handleStopTestAll = () => {
    testAllAbortRef.current?.abort();
  };

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    type: "llm",
  });

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      alert("Model already exists for this provider.");
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to import models");
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert("No models returned from /models.");
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        if (allModels.some((entry) => entry.id === modelId)) continue;
        await onAddCustomModel(modelId);
        importedCount += 1;
      }
      if (importedCount === 0) {
        alert("No new models were added.");
      }
    } catch (error) {
      console.log("Error importing models:", error);
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);
  const canTestModels = connections.length > 0;
  const showTestAllProgress = testAllProgress.total > 0;
  const currentTestPosition = Math.min(testAllProgress.completed + 1, testAllProgress.total);
  const testAllProgressLabel = testAllProgress.stopped
    ? `Stopped after ${testAllProgress.completed} of ${testAllProgress.total}`
    : isTestingAll
    ? `Testing ${currentTestPosition} of ${testAllProgress.total}`
    : `Completed ${testAllProgress.completed} of ${testAllProgress.total}`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.
      </p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="new-compatible-model-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
          {importing ? "Importing..." : "Import from /models"}
        </Button>
        <Button size="sm" variant="secondary" icon="science" onClick={handleTestAllModels} disabled={!canTestModels || allModels.length === 0 || Boolean(testingModelId) || isTestingAll} loading={isTestingAll}>
          {isTestingAll ? "Testing..." : "Auto Test All"}
        </Button>
        {isTestingAll && (
          <Button size="sm" variant="secondary" icon="stop_circle" onClick={handleStopTestAll}>
            Stop
          </Button>
        )}
      </div>

      {showTestAllProgress && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs" role="status" aria-live="polite">
          <span className="inline-flex items-center gap-1 font-semibold text-text-main">
            <span className="material-symbols-outlined text-[16px]">
              {testAllProgress.stopped ? "stop_circle" : isTestingAll ? "progress_activity" : "task_alt"}
            </span>
            {testAllProgressLabel}
          </span>
          {testAllProgress.currentModelId && (
            <span className="min-w-0 truncate text-text-muted">
              Current: <span className="font-mono text-text-main">{testAllProgress.currentModelId}</span>
            </span>
          )}
          <span className="text-green-600 dark:text-green-400">Passed: {testAllProgress.passed}</span>
          <span className="text-red-600 dark:text-red-400">Failed: {testAllProgress.failed}</span>
        </div>
      )}

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add a connection to enable importing models.
        </p>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ id, alias, source }) => (
            <CompatibleModelRow
              key={`${source}-${providerStorageAlias}/${id}`}
              modelId={id}
              fullModel={`${providerDisplayAlias}/${id}`}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
              onTest={canTestModels ? () => handleTestModel(id) : undefined}
              testStatus={modelTestResults[id]}
              isTesting={testingModelId === id}
              isTestDisabled={isTestingAll || testingModelId === id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
};
