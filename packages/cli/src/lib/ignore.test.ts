import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CODEBASE_IGNORE_FILENAME,
	CODEBASE_IGNORE_TEMPLATE,
	ensureCodebaseIgnore,
	isBuiltInExcluded,
	LEGACY_IGNORE_FILENAME,
	matchesCustomIgnore,
	readCodebaseIgnore,
} from "./ignore.js";

async function makeTempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vibee-ignore-test-"));
	return root;
}

describe("readCodebaseIgnore", () => {
	it("returns empty patterns when no ignore file exists without creating one", async () => {
		const root = await makeTempRoot();
		const rules = await readCodebaseIgnore(root);
		expect(rules.root).toBe(root);
		expect(rules.patterns).toEqual([]);
		expect(rules.source).toBe("none");
		// Must not mutate the repository: neither control file is created.
		await expect(stat(join(root, CODEBASE_IGNORE_FILENAME))).rejects.toThrow();
		await expect(stat(join(root, LEGACY_IGNORE_FILENAME))).rejects.toThrow();
	});

	it("parses custom patterns and ignores comments and blank lines", async () => {
		const root = await makeTempRoot();
		await writeFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			[
				"# custom exclusions",
				"",
				"custom-dir/",
				"*.log",
				"  secret-fixture.txt  ",
				"# trailing comment",
				"",
			].join("\n"),
			"utf-8",
		);
		const rules = await readCodebaseIgnore(root);
		expect(rules.source).toBe("canonical");
		expect(rules.patterns).toEqual([
			"custom-dir/",
			"*.log",
			"secret-fixture.txt",
		]);
	});

	it("reads existing rules without mutating the repository", async () => {
		const root = await makeTempRoot();
		const content = "custom-dir/\n*.log\n";
		const filePath = join(root, CODEBASE_IGNORE_FILENAME);
		await writeFile(filePath, content, "utf-8");
		const before = await stat(filePath);
		const rules = await readCodebaseIgnore(root);
		expect(rules.raw).toBe(content);
		const after = await readFile(filePath, "utf-8");
		expect(after).toBe(content);
		expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
	});

	it("treats negation rules as inert so user rules cannot lift built-in protection", async () => {
		const root = await makeTempRoot();
		await mkdir(join(root, "sub"), { recursive: true });
		await writeFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			"!.env\n!node_modules/\n",
			"utf-8",
		);
		const rules = await readCodebaseIgnore(root);
		// Negations are recorded but must never override secret/unsafe protection;
		// the scanner enforces built-ins independently of these patterns.
		expect(rules.patterns).toEqual([]);
		// They are reported instead of failing silently.
		expect(rules.droppedNegations).toEqual(["!.env", "!node_modules/"]);
	});

	it("honors a legacy .prdfyignore when no canonical file exists", async () => {
		const root = await makeTempRoot();
		await writeFile(
			join(root, LEGACY_IGNORE_FILENAME),
			"legacy-dir/\n*.legacy-log\n",
			"utf-8",
		);
		const rules = await readCodebaseIgnore(root);
		expect(rules.source).toBe("legacy");
		// Previously excluded paths stay excluded: the legacy file is not
		// silently discarded.
		expect(rules.patterns).toEqual(["legacy-dir/", "*.legacy-log"]);
	});

	it("prefers the canonical file when both control files exist", async () => {
		const root = await makeTempRoot();
		await writeFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			"canonical-dir/\n",
			"utf-8",
		);
		await writeFile(
			join(root, LEGACY_IGNORE_FILENAME),
			"legacy-dir/\n",
			"utf-8",
		);
		const rules = await readCodebaseIgnore(root);
		expect(rules.source).toBe("canonical");
		expect(rules.patterns).toEqual(["canonical-dir/"]);
	});
});

describe("ensureCodebaseIgnore", () => {
	it("creates .everythingsvibeignore from the default template when missing", async () => {
		const root = await makeTempRoot();
		const result = await ensureCodebaseIgnore(root);
		expect(result.created).toBe(true);
		expect(result.source).toBe("canonical");
		const content = await readFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			"utf-8",
		);
		expect(content).toBe(CODEBASE_IGNORE_TEMPLATE);
		// No legacy file is created as a side effect.
		await expect(stat(join(root, LEGACY_IGNORE_FILENAME))).rejects.toThrow();
	});

	it("is idempotent and never overwrites existing user rules", async () => {
		const root = await makeTempRoot();
		const userRules = "internal/\n*.log\n";
		await writeFile(join(root, CODEBASE_IGNORE_FILENAME), userRules, "utf-8");
		const before = await stat(join(root, CODEBASE_IGNORE_FILENAME));

		const result = await ensureCodebaseIgnore(root);

		expect(result.created).toBe(false);
		expect(result.source).toBe("canonical");
		expect(await readFile(join(root, CODEBASE_IGNORE_FILENAME), "utf-8")).toBe(
			userRules,
		);
		expect((await stat(join(root, CODEBASE_IGNORE_FILENAME))).mtimeMs).toBe(
			before.mtimeMs,
		);
	});

	it("leaves a legacy-only setup untouched without creating a second file", async () => {
		const root = await makeTempRoot();
		const legacyRules = "legacy-dir/\n";
		await writeFile(join(root, LEGACY_IGNORE_FILENAME), legacyRules, "utf-8");

		const result = await ensureCodebaseIgnore(root);

		expect(result.created).toBe(false);
		expect(result.source).toBe("legacy");
		expect(await readFile(join(root, LEGACY_IGNORE_FILENAME), "utf-8")).toBe(
			legacyRules,
		);
		await expect(stat(join(root, CODEBASE_IGNORE_FILENAME))).rejects.toThrow();
	});

	it("creates a template containing no active patterns", async () => {
		// Built-ins already cover secrets/build/binaries; an active pattern in
		// the seed file would silently change what gets uploaded.
		const root = await makeTempRoot();
		await ensureCodebaseIgnore(root);
		const rules = await readCodebaseIgnore(root);
		expect(rules.patterns).toEqual([]);
		expect(rules.droppedNegations).toEqual([]);
	});

	it("writes a template that is readable as custom rules when uncommented", async () => {
		const root = await makeTempRoot();
		await ensureCodebaseIgnore(root);
		const content = await readFile(
			join(root, CODEBASE_IGNORE_FILENAME),
			"utf-8",
		);
		// Documents the built-in coverage and shows example syntax.
		expect(content).toContain("node_modules/");
		expect(content).toContain(".env");
		expect(content).toContain("!...");
	});
});

describe("isBuiltInExcluded", () => {
	it("excludes the .vercel directory at any depth", () => {
		for (const path of [
			".vercel/project.json",
			".vercel/output/static/index.html",
			"apps/web/.vercel/project.json",
			"a/b/c/.vercel/README.txt",
		]) {
			expect(isBuiltInExcluded(path, false)).toEqual({
				excluded: true,
				reason: "built-in:build",
			});
		}
		expect(isBuiltInExcluded(".vercel", true)).toEqual({
			excluded: true,
			reason: "built-in:build",
		});
	});

	it("keeps deployment configuration files eligible for sync", () => {
		for (const path of [
			"vercel.json",
			"apps/web/vercel.json",
			"netlify.toml",
			"fly.toml",
			"railway.json",
			"wrangler.toml",
			".github/workflows/deploy.yml",
		]) {
			expect(isBuiltInExcluded(path, false)).toEqual({ excluded: false });
		}
	});

	it("keeps the existing built-in exclusions unchanged", () => {
		expect(isBuiltInExcluded(".git/config", false)).toEqual({
			excluded: true,
			reason: "built-in:vcs",
		});
		expect(isBuiltInExcluded("node_modules/pkg/index.js", false)).toEqual({
			excluded: true,
			reason: "built-in:dependency",
		});
		expect(isBuiltInExcluded("dist/bundle.js", false)).toEqual({
			excluded: true,
			reason: "built-in:build",
		});
		expect(isBuiltInExcluded(".next/server/page.js", false)).toEqual({
			excluded: true,
			reason: "built-in:build",
		});
		expect(isBuiltInExcluded(".env.local", false)).toEqual({
			excluded: true,
			reason: "built-in:dotenv",
		});
		expect(isBuiltInExcluded("certs/server.pem", false)).toEqual({
			excluded: true,
			reason: "built-in:key-material",
		});
		expect(isBuiltInExcluded("dump.sql", false)).toEqual({
			excluded: true,
			reason: "built-in:database-dump",
		});
		expect(isBuiltInExcluded("secrets/token", false)).toEqual({
			excluded: true,
			reason: "built-in:secret-directory",
		});
		expect(isBuiltInExcluded("src/app.ts", false)).toEqual({ excluded: false });
	});

	it("cannot be lifted by a custom negation, only narrowed further", () => {
		// Negations are dropped at parse time, so a user rule can never re-include
		// a built-in exclusion.
		expect(matchesCustomIgnore(".vercel/project.json", false, [])).toBe(false);
		expect(
			matchesCustomIgnore(".vercel/project.json", false, ["!.vercel/"]),
		).toBe(false);
		// Additional user rules still apply on top of the built-ins.
		expect(
			matchesCustomIgnore("internal/notes.md", false, ["internal/"]),
		).toBe(true);
	});
});
