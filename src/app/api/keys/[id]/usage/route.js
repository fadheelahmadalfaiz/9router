import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { getApiKeyUsageSummary } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    const usage = await getApiKeyUsageSummary(key.key);

    return NextResponse.json({ usage });
  } catch (error) {
    console.log("Error fetching key usage:", error);
    return NextResponse.json({ error: "Failed to fetch key usage" }, { status: 500 });
  }
}
