import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve("src");
const studioRoot = join(sourceRoot, "features/studio");

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
	const path = specifier.startsWith("@/")
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
	return source.statements.flatMap((statement) => {
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
}

describe("Studio client module boundary", () => {
	it("keeps server runtimes out of component and hook static imports", () => {
		const roots = ["components", "hooks", "utils"].flatMap((directory) =>
			sourceFiles(join(studioRoot, directory)),
		);
		const seen = new Set<string>();
		const violations: string[] = [];
		function visit(path: string, chain: string[]) {
			if (seen.has(path)) return;
			seen.add(path);
			for (const specifier of runtimeImports(path)) {
				const next = resolveSource(specifier, path);
				if (
					/^(node:|pg$|playwright$)/.test(specifier) ||
					(next && /[\\/]db[\\/]|\.server\.ts$/.test(next))
				) {
					violations.push([...chain, path, specifier].join(" -> "));
				} else if (next) {
					visit(next, [...chain, path]);
				}
			}
		}
		for (const root of roots) visit(root, []);
		expect(violations).toEqual([]);
	});
});
