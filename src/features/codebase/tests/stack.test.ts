import { describe, expect, test } from "vitest";
import {
	detectCodebaseStack,
	detectStackFromDependencies,
	detectStackFromFiles,
	detectStackFromPackageJsonText,
	manifestToExplorerFiles,
	mergeStackWithFallback,
	normalizeStack,
} from "@/features/codebase/services/stack";

describe("Phase 08 - Tech Stack Detection (p8.md)", () => {
	// 1. Astro + Tailwind + TypeScript terdeteksi bila evidence tersedia.
	test("1. Astro + Tailwind + TypeScript terdeteksi bila evidence tersedia", () => {
		const deps = ["astro", "tailwindcss", "typescript"];
		const result = detectStackFromDependencies(deps);
		expect(result).toEqual(["Astro", "Tailwind CSS", "TypeScript"]);

		const packageJson = JSON.stringify({
			dependencies: { astro: "^4.0.0", tailwindcss: "^3.4.0" },
			devDependencies: { typescript: "^5.0.0" },
		});
		const fromJson = detectStackFromPackageJsonText(packageJson);
		expect(fromJson).toEqual(["Astro", "Tailwind CSS", "TypeScript"]);
	});

	// 2. React + Vite tidak menyebabkan duplicate labels.
	test("2. React + Vite tidak menyebabkan duplicate labels", () => {
		const deps = ["react", "react-dom", "vite", "@vitejs/plugin-react"];
		const result = detectStackFromDependencies(deps);
		expect(result).toEqual(["React", "Vite"]);
	});

	// 3. Next.js + React dikenali secara konsisten.
	test("3. Next.js + React dikenali secara konsisten", () => {
		const deps = ["next", "react", "react-dom"];
		const result = detectStackFromDependencies(deps);
		expect(result).toEqual(["Next.js", "React"]);
	});

	// 4. SvelteKit tidak salah diklasifikasikan hanya sebagai Svelte.
	test("4. SvelteKit tidak salah diklasifikasikan hanya sebagai Svelte", () => {
		const depsOnlyKit = ["@sveltejs/kit"];
		expect(detectStackFromDependencies(depsOnlyKit)).toEqual(["SvelteKit"]);

		const depsWithBoth = ["@sveltejs/kit", "svelte"];
		const result = detectStackFromDependencies(depsWithBoth);
		expect(result).toContain("SvelteKit");
		expect(result).not.toEqual(["Svelte"]);
	});

	// 5. Angular dependency terdeteksi.
	test("5. Angular dependency terdeteksi", () => {
		const deps = ["@angular/core", "@angular/common"];
		const result = detectStackFromDependencies(deps);
		expect(result).toEqual(["Angular"]);
	});

	// 6. Framework tidak terdeteksi dari substring package yang tidak relevan.
	test("6. Framework tidak terdeteksi dari substring package yang tidak relevan", () => {
		const irrelevantDeps = [
			"astronomy",
			"reaction",
			"reactivate",
			"supervite",
			"not-angular",
			"unrelated-svelte",
			"left-pad",
			"avenue",
		];
		const result = detectStackFromDependencies(irrelevantDeps);
		expect(result).toEqual([]);
	});

	// 7. Missing package.json ditangani dengan benar.
	test("7. Missing package.json ditangani dengan benar", () => {
		// When package.json is missing, detect from config files
		const fromFiles = detectCodebaseStack({
			files: [
				{ path: "astro.config.mjs" },
				{ path: "tailwind.config.js" },
				{ path: "tsconfig.json" },
			],
		});
		expect(fromFiles).toEqual(["Astro", "Tailwind CSS", "TypeScript"]);

		// When no evidence is available at all, returns empty without inventing fake fallbacks
		const empty = detectCodebaseStack({});
		expect(empty).toEqual([]);
	});

	// 8. Malformed package.json tidak membuat aplikasi crash.
	test("8. Malformed package.json tidak membuat aplikasi crash", () => {
		expect(detectStackFromPackageJsonText("invalid json {")).toEqual([]);
		expect(detectStackFromPackageJsonText("{ broken: true,")).toEqual([]);
		expect(detectStackFromPackageJsonText(null)).toEqual([]);
		expect(detectStackFromPackageJsonText(undefined)).toEqual([]);

		const result = detectCodebaseStack({
			packageJsonTexts: ["not a json", "{ damaged"],
			files: [{ path: "astro.config.mjs" }],
		});
		expect(result).toEqual(["Astro"]);
	});

	// 9. Config file detection terverifikasi.
	test("9. Config file detection terverifikasi", () => {
		expect(detectStackFromFiles(["astro.config.mjs"])).toEqual(["Astro"]);
		expect(detectStackFromFiles(["next.config.js"])).toEqual(["Next.js"]);
		expect(detectStackFromFiles(["nuxt.config.ts"])).toEqual([
			"Nuxt",
			"TypeScript",
		]);
		expect(detectStackFromFiles(["svelte.config.js"])).toEqual(["Svelte"]);
		expect(detectStackFromFiles(["angular.json"])).toEqual(["Angular"]);
		expect(detectStackFromFiles(["vite.config.ts"])).toEqual([
			"Vite",
			"TypeScript",
		]);
		expect(detectStackFromFiles(["tailwind.config.js"])).toEqual([
			"Tailwind CSS",
		]);
		expect(detectStackFromFiles(["tsconfig.json"])).toEqual(["TypeScript"]);
		expect(detectStackFromFiles(["drizzle.config.ts"])).toEqual([
			"TypeScript",
			"Drizzle",
		]);
	});

	// 10. Multi-package repository tidak kehilangan stack yang relevan.
	test("10. Multi-package repository tidak kehilangan stack yang relevan", () => {
		const rootPkg = JSON.stringify({
			name: "monorepo",
			workspaces: ["packages/*"],
		});
		const webPkg = JSON.stringify({
			dependencies: { astro: "^4.0.0", tailwindcss: "^3.0.0" },
		});
		const apiPkg = JSON.stringify({
			dependencies: {
				fastify: "^4.0.0",
				"drizzle-orm": "^0.30.0",
				typescript: "^5.0.0",
			},
		});

		const result = detectCodebaseStack({
			packageJsonTexts: [rootPkg, webPkg, apiPkg],
			files: [
				{ path: "packages/web/astro.config.mjs" },
				{ path: "packages/api/tsconfig.json" },
				{ path: "node_modules/ignored/package.json" },
			],
		});

		expect(result).toEqual([
			"Astro",
			"Tailwind CSS",
			"TypeScript",
			"Fastify",
			"Drizzle",
		]);
	});

	// 11. Stale snapshot tidak memengaruhi hasil baru.
	test("11. Stale snapshot tidak memengaruhi hasil baru", () => {
		const oldSnapshotStack = detectCodebaseStack({
			packageJsonTexts: [
				JSON.stringify({ dependencies: { vue: "^3.0.0", vite: "^5.0.0" } }),
			],
		});
		expect(oldSnapshotStack).toEqual(["Vue.js", "Vite"]);

		// New snapshot switches to Astro + Tailwind CSS
		const newSnapshotStack = detectCodebaseStack({
			packageJsonTexts: [
				JSON.stringify({
					dependencies: { astro: "^4.0.0", tailwindcss: "^3.0.0" },
				}),
			],
		});
		expect(newSnapshotStack).toEqual(["Astro", "Tailwind CSS"]);
		expect(newSnapshotStack).not.toContain("Vue.js");
		expect(newSnapshotStack).not.toContain("Vite");
	});

	// 12. Analysis fallback tidak menghapus hasil deterministik.
	test("12. Analysis fallback tidak menghapus hasil deterministik", () => {
		const fromDeps = ["Astro", "Tailwind CSS"];
		const analysisFallback = ["TypeScript", "PostgreSQL"];
		const merged = mergeStackWithFallback(fromDeps, analysisFallback);
		expect(merged).toEqual([
			"Astro",
			"Tailwind CSS",
			"TypeScript",
			"PostgreSQL",
		]);
	});

	// 13. Deteksi tetap dapat berjalan tanpa AI analysis.
	test("13. Deteksi tetap dapat berjalan tanpa AI analysis", () => {
		const result = detectCodebaseStack({
			packageJsonTexts: [
				JSON.stringify({
					dependencies: {
						astro: "^4.0.0",
						tailwindcss: "^3.0.0",
						typescript: "^5.0.0",
					},
				}),
			],
			files: [{ path: "astro.config.mjs" }, { path: "tsconfig.json" }],
			supplementary: undefined,
		});
		expect(result).toEqual(["Astro", "Tailwind CSS", "TypeScript"]);
	});

	// 14. No duplicate stack labels.
	test("14. No duplicate stack labels", () => {
		const input = [
			"React",
			"react",
			"Vite",
			"Tailwind CSS",
			"Tailwind CSS",
			"React",
		];
		const result = normalizeStack(input);
		expect(result).toEqual(["React", "Vite", "Tailwind CSS"]);
		expect(new Set(result).size).toBe(result.length);
	});

	// Special rule: Astro embeds Vite internally; suppress independent Vite badge
	test("Astro suppresses internal Vite dependency from appearing as primary framework", () => {
		const deps = ["astro", "vite", "tailwindcss", "typescript"];
		const result = detectStackFromDependencies(deps);
		expect(result).toEqual(["Astro", "Tailwind CSS", "TypeScript"]);
		expect(result).not.toContain("Vite");
	});

	// Dynamic & non-JS / non-standard ecosystem detection
	test("detects TanStack Start, Rust, Bun, Go, Python via file/dep signatures", () => {
		expect(
			detectStackFromDependencies(["@tanstack/react-start", "tailwindcss"]),
		).toEqual(["TanStack Start", "Tailwind CSS"]);

		expect(detectStackFromFiles(["Cargo.toml", "src/main.rs"])).toEqual([
			"Rust",
		]);

		expect(detectStackFromFiles(["go.mod", "main.go"])).toEqual(["Go"]);

		expect(detectStackFromFiles(["pyproject.toml", "src/app.py"])).toEqual([
			"Python",
		]);

		expect(detectStackFromFiles(["bun.lockb", "bunfig.toml"])).toEqual(["Bun"]);
	});

	test("accepts arbitrary unlisted tech stacks dynamically from AI analysis without hardcoding", () => {
		const result = detectCodebaseStack({
			files: [{ path: "src/main.gleam" }],
			supplementary: ["Gleam", "Lustre", "PostgreSQL"],
		});
		// Gleam and Lustre are not in STACK_RULES, but dynamic supplementary surfaces them!
		expect(result).toContain("Gleam");
		expect(result).toContain("Lustre");
		expect(result).toContain("PostgreSQL");
	});
});

describe("manifestToExplorerFiles", () => {
	test("maps valid manifest entries to explorer files", () => {
		const manifest = [
			{
				path: "src/App.jsx",
				size: 100,
				hash: "a".repeat(64),
			},
			{
				path: "package.json",
				size: 200,
				hash: "b".repeat(64),
			},
		];
		expect(manifestToExplorerFiles(manifest)).toEqual([
			{ path: "src/App.jsx" },
			{ path: "package.json" },
		]);
	});

	test("returns empty list for invalid manifest", () => {
		expect(manifestToExplorerFiles(null)).toEqual([]);
		expect(manifestToExplorerFiles([{ path: "../evil", size: 1 }])).toEqual([]);
	});
});
