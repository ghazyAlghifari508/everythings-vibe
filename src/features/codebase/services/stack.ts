import { manifestEntrySchema } from "./sync";

export interface ExplorerFileEntry {
	path: string;
}

export interface CodebaseStackInput {
	packageJsonText?: unknown;
	packageJsonTexts?: unknown[];
	files?: Array<{ path: string } | string>;
	supplementary?: string[];
}

interface StackRule {
	id: string;
	label: string;
	matchDep: (dep: string) => boolean;
	matchFile?: (path: string) => boolean;
}

const STACK_RULES: readonly StackRule[] = [
	{
		id: "astro",
		label: "Astro",
		matchDep: (dep) =>
			dep === "astro" ||
			dep.startsWith("astro-") ||
			dep.startsWith("astro/") ||
			dep.startsWith("@astrojs/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("astro.config.") || path.endsWith(".astro");
		},
	},
	{
		id: "next",
		label: "Next.js",
		matchDep: (dep) =>
			dep === "next" ||
			dep.startsWith("next-") ||
			dep.startsWith("next/") ||
			dep.startsWith("@next/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("next.config.");
		},
	},
	{
		id: "nuxt",
		label: "Nuxt",
		matchDep: (dep) =>
			dep === "nuxt" ||
			dep.startsWith("nuxt-") ||
			dep.startsWith("nuxt/") ||
			dep.startsWith("@nuxt/") ||
			dep.startsWith("@nuxtjs/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("nuxt.config.");
		},
	},
	{
		id: "sveltekit",
		label: "SvelteKit",
		matchDep: (dep) =>
			dep === "@sveltejs/kit" ||
			dep.startsWith("@sveltejs/kit/") ||
			dep.startsWith("@sveltejs/kit-"),
		matchFile: (path) => {
			const lower = path.toLowerCase();
			return (
				lower.includes("svelte.config.") &&
				(lower.includes("adapter-") || lower.includes("@sveltejs/kit"))
			);
		},
	},
	{
		id: "svelte",
		label: "Svelte",
		matchDep: (dep) =>
			dep === "svelte" ||
			dep.startsWith("svelte-") ||
			dep.startsWith("svelte/") ||
			(dep.startsWith("@sveltejs/") && !dep.startsWith("@sveltejs/kit")),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("svelte.config.") || path.endsWith(".svelte");
		},
	},
	{
		id: "angular",
		label: "Angular",
		matchDep: (dep) =>
			dep === "angular" ||
			dep.startsWith("angular-") ||
			dep.startsWith("angular/") ||
			dep.startsWith("@angular/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base === "angular.json";
		},
	},
	{
		id: "vue",
		label: "Vue.js",
		matchDep: (dep) =>
			dep === "vue" ||
			dep.startsWith("vue-") ||
			dep.startsWith("vue/") ||
			dep.startsWith("@vue/"),
		matchFile: (path) => {
			return path.endsWith(".vue");
		},
	},
	{
		id: "react",
		label: "React",
		matchDep: (dep) =>
			dep === "react" ||
			dep === "react-dom" ||
			dep.startsWith("react-") ||
			dep.startsWith("react/") ||
			dep.startsWith("@react/"),
	},
	{
		id: "vite",
		label: "Vite",
		matchDep: (dep) =>
			dep === "vite" ||
			dep.startsWith("vite-") ||
			dep.startsWith("vite/") ||
			dep.startsWith("@vitejs/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("vite.config.");
		},
	},
	{
		id: "tailwindcss",
		label: "Tailwind CSS",
		matchDep: (dep) =>
			dep === "tailwindcss" ||
			dep.startsWith("tailwindcss-") ||
			dep.startsWith("tailwindcss/") ||
			dep.startsWith("@tailwindcss/") ||
			dep.startsWith("tailwind-"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("tailwind.config.");
		},
	},
	{
		id: "typescript",
		label: "TypeScript",
		matchDep: (dep) =>
			dep === "typescript" ||
			dep.startsWith("typescript-") ||
			dep.startsWith("typescript/") ||
			dep.startsWith("@typescript-eslint/") ||
			dep.startsWith("@types/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			if (base === "tsconfig.json" || /^tsconfig(\..+)?\.json$/.test(base)) {
				return true;
			}
			return (
				path.endsWith(".ts") ||
				path.endsWith(".tsx") ||
				path.endsWith(".mts") ||
				path.endsWith(".cts")
			);
		},
	},
	{
		id: "express",
		label: "Express.js",
		matchDep: (dep) =>
			dep === "express" ||
			dep.startsWith("express-") ||
			dep.startsWith("express/"),
	},
	{
		id: "fastify",
		label: "Fastify",
		matchDep: (dep) =>
			dep === "fastify" ||
			dep.startsWith("fastify-") ||
			dep.startsWith("fastify/") ||
			dep.startsWith("@fastify/"),
	},
	{
		id: "hono",
		label: "Hono",
		matchDep: (dep) =>
			dep === "hono" ||
			dep.startsWith("hono-") ||
			dep.startsWith("hono/") ||
			dep.startsWith("@hono/"),
	},
	{
		id: "drizzle",
		label: "Drizzle",
		matchDep: (dep) =>
			dep === "drizzle-orm" ||
			dep.startsWith("drizzle-orm/") ||
			dep.startsWith("drizzle-kit"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("drizzle.config.");
		},
	},
	{
		id: "tanstack-start",
		label: "TanStack Start",
		matchDep: (dep) =>
			dep === "@tanstack/react-start" ||
			dep === "@tanstack/start" ||
			dep.startsWith("@tanstack/react-start/") ||
			dep.startsWith("@tanstack/start/"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base.startsWith("app.config.");
		},
	},
	{
		id: "rust",
		label: "Rust",
		matchDep: () => false,
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base === "cargo.toml" || path.endsWith(".rs");
		},
	},
	{
		id: "go",
		label: "Go",
		matchDep: () => false,
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return base === "go.mod" || path.endsWith(".go");
		},
	},
	{
		id: "python",
		label: "Python",
		matchDep: () => false,
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return (
				base === "pyproject.toml" ||
				base === "requirements.txt" ||
				path.endsWith(".py")
			);
		},
	},
	{
		id: "bun",
		label: "Bun",
		matchDep: (dep) => dep === "bun" || dep.startsWith("@types/bun"),
		matchFile: (path) => {
			const base = path.split("/").pop() ?? "";
			return (
				base === "bunfig.toml" || base === "bun.lock" || base === "bun.lockb"
			);
		},
	},
];

const CANONICAL_ORDER: readonly string[] = [
	"TanStack Start",
	"Astro",
	"Next.js",
	"Nuxt",
	"SvelteKit",
	"Svelte",
	"Vue.js",
	"React",
	"Angular",
	"Vite",
	"Tailwind CSS",
	"TypeScript",
	"Rust",
	"Go",
	"Python",
	"Bun",
	"Express.js",
	"Fastify",
	"Hono",
	"Drizzle",
];

const CANONICAL_MAP = new Map<string, string>(
	CANONICAL_ORDER.map((label) => [label.toLowerCase(), label]),
);

export function normalizeStack(labels: Iterable<string>): string[] {
	const canonicalByLower = new Map<string, string>();
	for (const label of labels) {
		if (typeof label !== "string") continue;
		const trimmed = label.trim();
		if (!trimmed) continue;
		const lower = trimmed.toLowerCase();
		const canonical = CANONICAL_MAP.get(lower) ?? trimmed;
		if (!canonicalByLower.has(lower)) {
			canonicalByLower.set(lower, canonical);
		}
	}
	// ponytail: Astro embeds Vite internally; suppress independent Vite badge when Astro is present.
	if (canonicalByLower.has("astro")) {
		canonicalByLower.delete("vite");
	}
	const result = Array.from(canonicalByLower.values());
	return result.sort((a, b) => {
		const idxA = CANONICAL_ORDER.indexOf(a);
		const idxB = CANONICAL_ORDER.indexOf(b);
		if (idxA !== -1 && idxB !== -1) return idxA - idxB;
		if (idxA !== -1) return -1;
		if (idxB !== -1) return 1;
		return a.localeCompare(b);
	});
}

export function detectStackFromDependencies(deps: string[]): string[] {
	const normalized = deps.map((dep) => dep.toLowerCase().trim());
	const labels = new Set<string>();
	for (const rule of STACK_RULES) {
		if (normalized.some((dep) => rule.matchDep(dep))) {
			labels.add(rule.label);
		}
	}
	return normalizeStack(labels);
}

function collectDependencyKeys(value: unknown): string[] {
	if (typeof value !== "object" || value === null) return [];
	const record = value as Record<string, unknown>;
	const deps =
		typeof record.dependencies === "object" && record.dependencies !== null
			? Object.keys(record.dependencies as Record<string, unknown>)
			: [];
	const devDeps =
		typeof record.devDependencies === "object" &&
		record.devDependencies !== null
			? Object.keys(record.devDependencies as Record<string, unknown>)
			: [];
	return [...deps, ...devDeps];
}

export function detectStackFromPackageJsonText(text: unknown): string[] {
	if (typeof text !== "string") return [];
	const trimmed = text.trim();
	if (!trimmed) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch {
		return [];
	}
	return detectStackFromDependencies(collectDependencyKeys(parsed));
}

export function detectStackFromFiles(
	files: Array<{ path: string } | string>,
): string[] {
	const labels = new Set<string>();
	for (const item of files) {
		const rawPath = typeof item === "string" ? item : item?.path;
		if (typeof rawPath !== "string") continue;
		const normalized = rawPath.replace(/\\/g, "/").toLowerCase().trim();
		if (
			!normalized ||
			normalized.includes("node_modules/") ||
			normalized.includes(".git/")
		) {
			continue;
		}
		for (const rule of STACK_RULES) {
			if (rule.matchFile?.(normalized)) {
				labels.add(rule.label);
			}
		}
	}
	return normalizeStack(labels);
}

export function manifestToExplorerFiles(
	manifest: unknown,
): ExplorerFileEntry[] {
	const parsed = manifestEntrySchema.array().safeParse(manifest ?? []);
	if (!parsed.success) return [];
	return parsed.data.map((entry) => ({ path: entry.path }));
}

export function mergeStackWithFallback(
	primary: string[],
	fallback: string[],
): string[] {
	return normalizeStack([...(primary ?? []), ...(fallback ?? [])]);
}

export function detectCodebaseStack(input: CodebaseStackInput): string[] {
	const allDeps: string[] = [];
	const texts: unknown[] = [
		...(Array.isArray(input.packageJsonTexts) ? input.packageJsonTexts : []),
		...(input.packageJsonText != null ? [input.packageJsonText] : []),
	];

	for (const text of texts) {
		if (typeof text !== "string") continue;
		const trimmed = text.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			allDeps.push(...collectDependencyKeys(parsed));
		} catch {}
	}

	const fromDeps = detectStackFromDependencies(allDeps);
	const fromFiles = input.files ? detectStackFromFiles(input.files) : [];
	const supplementary = Array.isArray(input.supplementary)
		? input.supplementary.filter(
				(item): item is string =>
					typeof item === "string" &&
					item.trim().length > 0 &&
					item.trim() !== "Tidak terdeteksi" &&
					!["npm", "pnpm", "yarn", "bun", "javascript"].includes(
						item.trim().toLowerCase(),
					),
			)
		: [];

	return normalizeStack([...fromDeps, ...fromFiles, ...supplementary]);
}
