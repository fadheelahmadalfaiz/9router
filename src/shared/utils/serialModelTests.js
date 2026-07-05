export async function runSerialModelTests(models, testOneModel, callbacks = {}, signal) {
  const results = [];

  for (const model of models) {
    if (signal?.aborted) {
      callbacks.onCancel?.(results);
      return { status: "cancelled", results };
    }

    callbacks.onStart?.(model);

    try {
      const result = await testOneModel(model, { signal });

      if (signal?.aborted) {
        callbacks.onCancel?.(results);
        return { status: "cancelled", results };
      }

      const entry = { id: model.id, status: result?.ok ? "ok" : "error", result };
      results.push(entry);
      callbacks.onResult?.(entry, model);
    } catch (error) {
      if (signal?.aborted) {
        callbacks.onCancel?.(results);
        return { status: "cancelled", results };
      }

      const entry = { id: model.id, status: "error", error };
      results.push(entry);
      callbacks.onResult?.(entry, model);
    }
  }

  callbacks.onComplete?.(results);
  return { status: "complete", results };
}
