import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
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
	// Pre-transform the SSR module graph while the server boots: measured first
	// request after restart spends ~7-13s in a serialized 471-module transform
	// waterfall; the route tree is the top of that graph on every page.
	server: {
		warmup: {
			ssrFiles: [
				"src/routeTree.gen.ts",
				"src/routes/__root.tsx",
				"src/router.tsx",
				"src/routes/**/*.tsx",
				"src/routes/**/*.ts",
				"src/app/providers.tsx",
			],
		},
	},
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
