import { manifestEntrySchema } from "./codebase-sync";

export interface ExplorerFileEntry {
	path: string;
}

interface StackRule {
	match: string;
	label: string;
}

const STACK_RULES: readonly StackRule[] = [
	{ match: "react", label: "React" },
	{ match: "vite", label: "Vite" },
	{ match: "tailwindcss", label: "Tailwind" },
	{ match: "typescript", label: "TypeScript" },
	{ match: "next", label: "Next.js" },
	{ match: "vue", label: "Vue.js" },
	{ match: "nuxt", label: "Nuxt" },
	{ match: "svelte", label: "Svelte" },
	{ match: "express", label: "Express.js" },
	{ match: "fastify", label: "Fastify" },
	{ match: "hono", label: "Hono" },
	{ match: "drizzle-orm", label: "Drizzle" },
];

function matchesRule(dep: string, match: string): boolean {
	if (dep === match) return true;
	if (dep.startsWith(`${match}-`)) return true;
	if (dep.startsWith(`${match}/`)) return true;
	if (dep.startsWith(`@${match}/`)) return true;
	if (match === "tailwindcss" && dep.startsWith("@tailwindcss/")) return true;
	if (match === "vite" && dep.startsWith("@vitejs/")) return true;
	return false;
}

export function detectStackFromDependencies(deps: string[]): string[] {
	const normalized = deps.map((dep) => dep.toLowerCase());
	const labels: string[] = [];
	for (const rule of STACK_RULES) {
		if (normalized.some((dep) => matchesRule(dep, rule.match))) {
			labels.push(rule.label);
		}
	}
	return labels;
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
	if (primary.length > 0) return [...primary];
	return [...fallback];
}
