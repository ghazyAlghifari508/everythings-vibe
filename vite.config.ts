import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import { resolveStudioDevtoolsConfig } from "./src/lib/devtools-policy";

const config = defineConfig(({ command, mode, isPreview }) => ({
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
		devtools(
			resolveStudioDevtoolsConfig(
				command === "serve" && mode === "development" && !isPreview
					? loadEnv(mode, process.cwd(), "VITE_")
					: {},
			),
		),
		tailwindcss(),
		tanstackStart({
			router: {
				// Test files beside routes otherwise log a route-tree warning on
				// every dev startup; they are already excluded from generation.
				routeFileIgnorePattern: "\\.test\\.",
			},
		}),
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
}));

export default config;
