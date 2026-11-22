import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	optimizeDeps: {
		include: [
			"@tanstack/react-router > @tanstack/react-store",
			"@tanstack/react-router > @tanstack/react-store > use-sync-external-store/shim/with-selector",
		],
	},
	// SSR warmup was removed after measurement: the broad ssrFiles globs warmed
	// the entire route graph (including route test files) on every restart. Vite
	// docs recommend warming only frequently used files; here that cost 127s of
	// transform work versus 7s without warmup and delayed the first HTML response.
	plugins: [
		devtools({ consolePiping: { enabled: false } }),
		tailwindcss(),
		// ponytail: TS type for tanstackStart's router option is narrower than the
		// runtime schema (zod parse accepts autoCodeSplitting). Cast bypasses TS;
		// verified against start-plugin-core vite/schema.d.ts which includes the field.
		tanstackStart({
			router: {
				autoCodeSplitting: true,
				// Test files beside routes otherwise log a route-tree warning on
				// every dev startup; they are already excluded from generation.
				routeFileIgnorePattern: "\\.test\\.",
			},
		} as never),
		viteReact(),
		nitro({ rollupConfig: { external: ["jsdom"] } }),
	],
	build: {
		rollupOptions: {
			output: {
				// ponytail: this Rolldown build requires a function, not the plain
				// object form Vite/Rollup normally accepts (throws "manualChunks is
				// not a function" otherwise).
				manualChunks(id: string) {
					if (id.includes("node_modules")) {
						if (/react-markdown|remark-gfm|rehype-highlight/.test(id)) {
							return "vendor-markdown";
						}
						if (id.includes("mermaid")) {
							return "vendor-mermaid";
						}
					}
				},
			},
		},
	},
});

export default config;
