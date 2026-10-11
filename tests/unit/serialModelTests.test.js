import { describe, expect, it, vi } from "vitest";
import { runSerialModelTests } from "@/shared/utils/serialModelTests.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runSerialModelTests", () => {
  it("runs model tests in input order", async () => {
    const calls = [];
    const runOne = vi.fn(async (model) => {
      calls.push(model.id);
      return { ok: true };
    });

    const outcome = await runSerialModelTests([
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
    ], runOne);

    expect(calls).toEqual(["model-a", "model-b", "model-c"]);
    expect(outcome).toEqual({
      status: "complete",
      results: [
        { id: "model-a", status: "ok", result: { ok: true } },
        { id: "model-b", status: "ok", result: { ok: true } },
        { id: "model-c", status: "ok", result: { ok: true } },
      ],
    });
  });

  it("does not start the next model before the current model resolves", async () => {
    const first = createDeferred();
    const events = [];
    const runOne = vi.fn((model) => {
      events.push(["start", model.id]);
      if (model.id === "model-a") return first.promise;
      return Promise.resolve({ ok: true });
    });

    const runPromise = runSerialModelTests([{ id: "model-a" }, { id: "model-b" }], runOne, {
      onResult: (entry) => events.push(["result", entry.id]),
    });

    await Promise.resolve();

    expect(events).toEqual([["start", "model-a"]]);
    expect(runOne).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true });
    await runPromise;

    expect(events).toEqual([
      ["start", "model-a"],
      ["result", "model-a"],
      ["start", "model-b"],
      ["result", "model-b"],
    ]);
  });

  it("records false ok responses and thrown errors as errors while continuing", async () => {
    const runOne = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "not available" })
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({ ok: true });

    const outcome = await runSerialModelTests([
      { id: "model-a" },
      { id: "model-b" },
      { id: "model-c" },
    ], runOne);

    expect(runOne).toHaveBeenCalledTimes(3);
    expect(outcome.status).toBe("complete");
    expect(outcome.results).toMatchObject([
      { id: "model-a", status: "error", result: { ok: false, error: "not available" } },
      { id: "model-b", status: "error" },
      { id: "model-c", status: "ok", result: { ok: true } },
    ]);
    expect(outcome.results[1].error).toBeInstanceOf(Error);
  });

  it("stops before starting the next model when aborted", async () => {
    const controller = new AbortController();
    const runOne = vi.fn(async () => {
      controller.abort();
      return { ok: true };
    });
    const onCancel = vi.fn();

    const outcome = await runSerialModelTests(
      [{ id: "model-a" }, { id: "model-b" }],
      runOne,
      { onCancel },
      controller.signal,
    );

    expect(runOne).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: "cancelled", results: [] });
    expect(onCancel).toHaveBeenCalledWith([]);
  });

  it("passes the abort signal to each model test", async () => {
    const controller = new AbortController();
    const runOne = vi.fn(async () => ({ ok: true }));

    await runSerialModelTests([{ id: "model-a" }], runOne, {}, controller.signal);

    expect(runOne).toHaveBeenCalledWith({ id: "model-a" }, { signal: controller.signal });
  });

  it("emits lifecycle callbacks in order", async () => {
    const events = [];

    const outcome = await runSerialModelTests(
      [{ id: "model-a" }],
      async () => ({ ok: true, latencyMs: 12 }),
      {
        onStart: (model) => events.push(["start", model.id]),
        onResult: (entry, model) => events.push(["result", entry.id, model.id, entry.status]),
        onComplete: (results) => events.push(["complete", results.length]),
      },
    );

    expect(outcome.status).toBe("complete");
    expect(events).toEqual([
      ["start", "model-a"],
      ["result", "model-a", "model-a", "ok"],
      ["complete", 1],
    ]);
  });
});
