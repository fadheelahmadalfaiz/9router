export const LIMIT_FIELD_CONFIG = [
  {
    field: "inputTokens5h",
    label: "5h input token limit",
    metric: "tokens",
    placeholder: "Unlimited",
    hint: "Maximum input tokens over the last 5 hours.",
  },
  {
    field: "inputTokens24h",
    label: "24h input token limit",
    metric: "tokens",
    placeholder: "Unlimited",
    hint: "Maximum input tokens over the last 24 hours.",
  },
  {
    field: "cost5h",
    label: "5h cost limit",
    metric: "cost",
    placeholder: "Unlimited",
    hint: "Maximum estimated cost over the last 5 hours.",
  },
  {
    field: "cost24h",
    label: "24h cost limit",
    metric: "cost",
    placeholder: "Unlimited",
    hint: "Maximum estimated cost over the last 24 hours.",
  },
];

const EMPTY_LIMIT_VALUES = Object.freeze({
  inputTokens5h: "",
  inputTokens24h: "",
  cost5h: "",
  cost24h: "",
});

export function createLimitFormValues(limits) {
  return LIMIT_FIELD_CONFIG.reduce((values, { field }) => {
    const value = limits?.[field];
    values[field] = value === null || value === undefined ? "" : String(value);
    return values;
  }, { ...EMPTY_LIMIT_VALUES });
}

export function getInvalidLimitField(formValues) {
  return LIMIT_FIELD_CONFIG.find(({ field }) => {
    const value = String(formValues[field] ?? "").trim();
    if (!value) return false;
    const number = Number(value);
    return !Number.isFinite(number) || number <= 0;
  })?.field || null;
}

export function buildLimitsPayload(formValues) {
  const hasAnyValue = LIMIT_FIELD_CONFIG.some(({ field }) => String(formValues[field] ?? "").trim() !== "");
  if (!hasAnyValue) return null;

  return LIMIT_FIELD_CONFIG.reduce((payload, { field }) => {
    const value = String(formValues[field] ?? "").trim();
    payload[field] = value ? Number(value) : null;
    return payload;
  }, {});
}

export function getLimitSummary(limits) {
  if (!limits || typeof limits !== "object") return "Unlimited";

  const enabled = LIMIT_FIELD_CONFIG.filter(({ field }) => Number(limits[field]) > 0)
    .map(({ field, metric }) => `${field.includes("5h") ? "5h" : "24h"} ${metric === "cost" ? "cost" : "input tokens"}`);

  return enabled.length > 0 ? enabled.join(", ") : "Unlimited";
}

export function formatLimitUsageValue(value, metric) {
  const number = Number(value) || 0;
  if (metric === "cost") return `$${number.toFixed(4)}`;
  return `${Math.round(number).toLocaleString()} tokens`;
}

export function formatLimitStatus(status) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
