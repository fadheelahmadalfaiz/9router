import { describe, expect, it, vi } from "vitest";

describe("Antigravity endpoint helpers", () => {
  it("exposes known local Antigravity targets", async () => {
    // Given: the local Antigravity helper module
    const { listAntigravityTargets } = await import("@/lib/antigravity-ide-lib.js");

    // When: targets are listed
    const targets = listAntigravityTargets();

    // Then: the known app variants are available without fork branding
    expect(targets.map((target) => target.id)).toEqual([
      "antigravity-app",
      "antigravity-app-v2",
      "antigravity-ide",
    ]);
    expect(targets.find((target) => target.id === "antigravity-app")?.displayName).toBe("Antigravity App");
  });

  it("detects Windows Antigravity app variants using path requirements", async () => {
    // Given: a Windows install with app.asar, which identifies the v2 app shape
    const { detectAntigravityInstallation, getAntigravityTarget } = await import("@/lib/antigravity-ide-lib.js");
    const env = { LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local", ProgramFiles: "C:\\Program Files" };
    const existing = new Set([
      "C:\\Users\\Test\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe",
      "C:\\Users\\Test\\AppData\\Local\\Programs\\Antigravity\\resources\\app.asar",
    ]);
    const existsSync = vi.fn((candidatePath) => existing.has(candidatePath));

    // When: both app variants are checked
    const v1 = detectAntigravityInstallation(getAntigravityTarget("antigravity-app"), {
      platform: "win32",
      existsSync,
      env,
    });
    const v2 = detectAntigravityInstallation(getAntigravityTarget("antigravity-app-v2"), {
      platform: "win32",
      existsSync,
      env,
    });

    // Then: v1 is rejected because app.asar exists, while v2 is detected
    expect(v1).toEqual({ installed: false, binary: null });
    expect(v2).toEqual({
      installed: true,
      binary: "C:\\Users\\Test\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe",
    });
  });

  it("returns a JSON response from the target listing route", async () => {
    // Given: the target listing route
    const { GET } = await import("@/app/api/antigravity-targets/route.js");

    // When: the route is invoked
    const response = await GET();
    const body = await response.json();

    // Then: it returns target status data without mutating configuration
    expect(response.status).toBe(200);
    expect(body.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "antigravity-app", displayName: "Antigravity App" }),
      expect.objectContaining({ id: "antigravity-app-v2", displayName: "Antigravity App v2" }),
      expect.objectContaining({ id: "antigravity-ide", displayName: "Antigravity IDE" }),
    ]));
  });
});
