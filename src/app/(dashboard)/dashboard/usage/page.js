"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UsageStats, RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const PERIOD_VALUES = new Set(PERIODS.map((option) => option.value));

function getUsagePeriodUrlState(searchParams) {
  const periodParam = searchParams.get("period") || "today";
  return {
    period: PERIOD_VALUES.has(periodParam) ? periodParam : "today",
  };
}

function setDefaultedParam(params, key, value, defaultValue) {
  const normalizedValue = String(value ?? "");
  if (!normalizedValue || normalizedValue === String(defaultValue)) {
    params.delete(key);
    return;
  }
  params.set(key, normalizedValue);
}

function buildUsagePeriodUrl(pathname, searchParamsString, state) {
  const params = new URLSearchParams(searchParamsString);
  setDefaultedParam(params, "period", state.period, "today");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const initialUrlState = useMemo(
    () => getUsagePeriodUrlState(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );

  const [period, setPeriod] = useState(initialUrlState.period);

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const replaceUsagePeriodUrlState = (updates) => {
    const currentState = getUsagePeriodUrlState(new URLSearchParams(searchParamsString));
    const nextUrl = buildUsagePeriodUrl(pathname, searchParamsString, {
      ...currentState,
      ...updates,
    });
    const currentUrl = searchParamsString
      ? `${pathname}?${searchParamsString}`
      : pathname;
    if (nextUrl === currentUrl) return;
    router.replace(nextUrl, { scroll: false });
  };

  const handlePeriodChange = (value) => {
    setPeriod(value);
    replaceUsagePeriodUrlState({ period: value });
  };

  useEffect(() => {
    setPeriod((prev) => (prev === initialUrlState.period ? prev : initialUrlState.period));
  }, [initialUrlState.period]);

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + period selector on same row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {activeTab === "overview" && (
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={handlePeriodChange}
            size="sm"
            className="w-full sm:w-auto"
          />
        )}
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={handlePeriodChange} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
