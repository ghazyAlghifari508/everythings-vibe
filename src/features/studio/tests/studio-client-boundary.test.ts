import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve("src");
const studioRoot = join(sourceRoot, "features/studio");
const scrapeRoot = join(sourceRoot, "features/scrape");

// The only Scrape modules another domain may import. Everything else in the
// feature — crawl traversal, worker, browser management, storage internals — is
// implementation detail.
const SCRAPE_PUBLIC_MODULES = new Set([
	join(scrapeRoot, "services/scrape-design-md-service.ts"),
]);

// A browser bundle must never depend on these, directly or transitively.
const SERVER_ONLY_SPECIFIERS = /^(node:|pg$|playwright$)/;
const SERVER_ONLY_PATHS = /[\\/]db[\\/]|\.server\.ts$/;

// The generated routing table references every route and therefore every
// feature by construction, so a chain through it proves nothing about which
// domain depends on which.
const GENERATED_ROUTE_TABLE = join(sourceRoot, "routeTree.gen.ts");

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory()
			? sourceFiles(path)
			: /\.tsx?$/.test(path)
				? [path]
				: [];
	});
}

function resolveSource(specifier: string, importer: string) {
	const path =
		specifier.startsWith("@/") || specifier.startsWith("#/")
			? join(sourceRoot, specifier.slice(2))
			: specifier.startsWith(".")
				? resolve(dirname(importer), specifier)
				: null;
	return path
		? [path, `${path}.ts`, `${path}.tsx`, join(path, "index.ts")].find(
				(candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate),
			)
		: undefined;
}

function runtimeImports(path: string) {
	const source = ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const specifiers = source.statements.flatMap((statement) => {
		if (
			(!ts.isImportDeclaration(statement) &&
				!ts.isExportDeclaration(statement)) ||
			!statement.moduleSpecifier ||
			!ts.isStringLiteral(statement.moduleSpecifier)
		)
			return [];
		if (ts.isImportDeclaration(statement)) {
			const clause = statement.importClause;
			if (clause?.isTypeOnly) return [];
			if (
				clause &&
				!clause.name &&
				clause.namedBindings &&
				ts.isNamedImports(clause.namedBindings) &&
				clause.namedBindings.elements.every((element) => element.isTypeOnly)
			)
				return [];
		} else if (
			statement.isTypeOnly ||
			(statement.exportClause &&
				ts.isNamedExports(statement.exportClause) &&
				statement.exportClause.elements.every((element) => element.isTypeOnly))
		)
			return [];
		return [statement.moduleSpecifier.text];
	});
	// Lazy `import("...")` and `require("...")` are runtime edges that a scan of
	// top-level declarations would miss; only string-literal specifiers resolve.
	const walk = (node: ts.Node) => {
		if (ts.isCallExpression(node) && node.arguments.length === 1) {
			const [argument] = node.arguments;
			const callee = node.expression;
			const loadsModule =
				callee.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(callee) && callee.text === "require");
			if (loadsModule && argument && ts.isStringLiteral(argument))
				specifiers.push(argument.text);
		}
		ts.forEachChild(node, walk);
	};
	walk(source);
	return specifiers;
}

function moduleEdges(path: string) {
	return runtimeImports(path).map((specifier) => ({
		specifier,
		resolved: resolveSource(specifier, path),
	}));
}

/**
 * Modules whose runtime graph reaches a server runtime, resolved transitively
 * and cycle-safely. Scrape and Studio may share pure modules; only graphs that
 * end in Node/Chromium/database code are off limits to browser consumers.
 */
function serverOnlyModules(): Set<string> {
	const graph = new Map(
		sourceFiles(sourceRoot).map((path) => [path, moduleEdges(path)]),
	);
	const serverOnly = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const [path, deps] of graph) {
			if (serverOnly.has(path)) continue;
			const reachesServer =
				SERVER_ONLY_PATHS.test(path) ||
				deps.some(
					({ specifier, resolved }) =>
						SERVER_ONLY_SPECIFIERS.test(specifier) ||
						Boolean(
							resolved &&
								(SERVER_ONLY_PATHS.test(resolved) || serverOnly.has(resolved)),
						),
				);
			if (reachesServer) {
				serverOnly.add(path);
				changed = true;
			}
		}
	}
	return serverOnly;
}

interface ScanRules {
	/** Records a violating chain when an import resolves to a forbidden target. */
	violation: (specifier: string, resolved: string | undefined) => boolean;
	/** A sanctioned contract module: never traversed beyond its own file. */
	boundary?: (resolved: string) => boolean;
}

/** Walks the resolved runtime import graph and reports the violating chains. */
function scanRuntimeGraph(roots: string[], rules: ScanRules): string[] {
	const seen = new Set<string>();
	const violations: string[] = [];
	function visit(path: string, chain: string[]) {
		if (seen.has(path)) return;
		seen.add(path);
		for (const { specifier, resolved } of moduleEdges(path)) {
			if (rules.violation(specifier, resolved))
				violations.push([...chain, path, specifier].join(" -> "));
			else if (
				resolved &&
				resolved !== GENERATED_ROUTE_TABLE &&
				!rules.boundary?.(resolved)
			)
				visit(resolved, [...chain, path]);
		}
	}
	for (const root of roots) visit(root, []);
	return violations;
}

const packageManifest = readFileSync(resolve("package.json"), "utf8");

function scriptValue(name: string): string | null {
	const match = new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`).exec(packageManifest);
	return match?.[1] ?? null;
}

function scriptEntryFile(name: string): string | null {
	const value = scriptValue(name);
	return value ? (/\btsx\s+(\S+\.ts)/.exec(value)?.[1] ?? null) : null;
}

describe("Studio client module boundary", () => {
	it("keeps server runtimes out of component and hook static imports", () => {
		const roots = ["components", "hooks", "utils"].flatMap((directory) =>
			sourceFiles(join(studioRoot, directory)),
		);
		expect(
			scanRuntimeGraph(roots, {
				violation: (specifier, next) =>
					SERVER_ONLY_SPECIFIERS.test(specifier) ||
					Boolean(next && SERVER_ONLY_PATHS.test(next)),
			}),
		).toEqual([]);
	});
});

describe("Studio and Scrape domain boundary", () => {
	it("keeps Scrape free of Studio implementation", () => {
		expect(
			scanRuntimeGraph(sourceFiles(scrapeRoot), {
				violation: (_specifier, next) => Boolean(next?.startsWith(studioRoot)),
			}),
		).toEqual([]);
	});

	it("imports Scrape from Studio only through the public DESIGN.md contract", () => {
		const offenders = sourceFiles(studioRoot).flatMap((path) =>
			moduleEdges(path)
				.filter(
					({ resolved }) =>
						resolved?.startsWith(scrapeRoot) &&
						!SCRAPE_PUBLIC_MODULES.has(resolved),
				)
				.map(({ specifier }) => `${path} -> ${specifier}`),
		);
		expect(offenders).toEqual([]);
	});

	it("keeps server-only Scrape internals out of the Studio graph", () => {
		const serverOnly = serverOnlyModules();
		expect(
			scanRuntimeGraph(sourceFiles(studioRoot), {
				boundary: (path) => SCRAPE_PUBLIC_MODULES.has(path),
				violation: (_specifier, next) =>
					Boolean(
						next?.startsWith(scrapeRoot) &&
							!SCRAPE_PUBLIC_MODULES.has(next) &&
							serverOnly.has(next),
					),
			}),
		).toEqual([]);
	}, 15000);

	it("runs the scrape worker from its own entry point, outside the web server", () => {
		expect(scriptEntryFile("scrape:worker")).toBe(
			"src/features/scrape/services/scrape-worker.ts",
		);
		expect(scriptEntryFile("dev:all")).toBe(
			"src/features/scrape/services/scrape-dev-all.ts",
		);
		expect(scriptValue("scrape:worker") ?? "").not.toContain("vite");

		const workerEntry = resolve(scriptEntryFile("scrape:worker") ?? "");
		expect(existsSync(workerEntry)).toBe(true);
		expect(
			scanRuntimeGraph([workerEntry], {
				violation: (_specifier, next) => Boolean(next?.startsWith(studioRoot)),
			}),
		).toEqual([]);
	});
});
