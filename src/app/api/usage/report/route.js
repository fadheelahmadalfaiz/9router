import { NextResponse } from "next/server";
import { getApiKeyUsageReport } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

function parseList(searchParams, name) {
  return searchParams.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

function filtersFromSearchParams(searchParams) {
  return {
    period: searchParams.get("period") || "7d",
    groupBy: searchParams.get("groupBy") || "apiKey",
    interval: searchParams.get("interval") || "day",
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    providers: parseList(searchParams, "provider"),
    models: parseList(searchParams, "model"),
    apiKeyIds: parseList(searchParams, "apiKeyId"),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const report = await getApiKeyUsageReport(filtersFromSearchParams(searchParams));
    return NextResponse.json(report);
  } catch (error) {
    console.log("Error fetching usage report:", error);
    return NextResponse.json({ error: "Failed to fetch usage report" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const filters = await request.json().catch(() => ({}));
    const report = await getApiKeyUsageReport(filters);
    return NextResponse.json(report);
  } catch (error) {
    console.log("Error creating usage report:", error);
    return NextResponse.json({ error: "Failed to create usage report" }, { status: 500 });
  }
}
