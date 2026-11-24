import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  server: { hmr: false },
  envPrefix: "CONTEST_DEMO_UNUSED_",
  plugins: [react(), {
    name: "contest-demo-import-boundary",
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (/\/node_modules\/(?:vite|react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser|lucide-react|@remix-run)\//.test(id)) continue;
        if (id.startsWith("\0")) continue;
        if (/\/contest-demo\//.test(id)) continue;
        if (/\/src\/(?:index\.css|components\/(?:ui|WorkspaceShell|FirebaseV2PageShell|ContextHelp|PortalSubpageLayout|HealthCheckLiveView)\.jsx|lib\/healthCheckPublicSchedule\.js|data\/(?:usageGuides|adminNavigation)\.js|config\/school\.js)$/.test(id)) continue;
        this.error(`Unexpected contest demo dependency: ${id}`);
      }
    },
  }],
});
