// ============= Full file contents =============

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Serve the app under a folder on a shared host, e.g. VITE_BASE_PATH=/mindful-money
// so it is reachable at https://example.com/mindful-money/. Unset (the Lovable
// preview and any standalone deploy) = served from the site root.
const BASE_PATH = normalizeBase(process.env["VITE_BASE_PATH"] ?? "");

function normalizeBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  return `${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}/`;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    base: BASE_PATH,
  },
});
