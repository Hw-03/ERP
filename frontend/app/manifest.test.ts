import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("describes DEXCOWIN MES as a standalone installable app", () => {
    const appManifest = manifest();

    expect(appManifest).toMatchObject({
      name: "DEXCOWIN MES",
      short_name: "MES",
      start_url: "/mes",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
    });

    expect(appManifest.icons).toEqual([
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ]);
  });

  it("points to generated PNG icons in public", () => {
    for (const icon of ["/icon-192x192.png", "/icon-512x512.png"]) {
      const iconPath = path.join(process.cwd(), "public", icon);
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });
});
