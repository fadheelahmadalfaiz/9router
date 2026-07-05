import { handleAntigravityTargetGet } from "@/lib/antigravity-ide-lib.js";

export async function GET() {
  return handleAntigravityTargetGet("antigravity-app");
}
