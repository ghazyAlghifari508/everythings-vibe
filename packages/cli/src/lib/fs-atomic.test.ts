import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ensureDirectory,
	isPathInsideRoot,
	PLAN_EXPORT_DIR_SEGMENTS,
	readFileIfExists,
	resolvePlanExportRoot,
	writeFileAtomic,
} from "./fs-atomic.js";

const tempRoots: string[] = [];

function makeTempDir(prefix = "prdfy-fs-atomic-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempRoots.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
	tempRoots.length = 0;
});

describe("PLAN_EXPORT_DIR_SEGMENTS", () => {
	it("targets docs/vibeplan and nothing else", () => {
		expect([...PLAN_EXPORT_DIR_SEGMENTS]).toEqual(["docs", "vibeplan"]);
	});

	it("resolves the export root relative to the repository root", () => {
		const root = makeTempDir();
		expect(resolvePlanExportRoot(root)).toBe(join(root, "docs", "vibeplan"));
	});
});

describe("writeFileAtomic", () => {
	it("replaces existing content and leaves no .tmp residue", async () => {
		const dir = makeTempDir();
		const target = join(dir, "feature.md");

		await writeFileAtomic(target, "first\n");
		expect(readFileSync(target, "utf-8")).toBe("first\n");

		await writeFileAtomic(target, "second\n");
		expect(readFileSync(target, "utf-8")).toBe("second\n");

		expect(readdirSync(dir)).toEqual(["feature.md"]);
	});

	it("creates the file when it does not exist yet", async () => {
		const dir = makeTempDir();
		const target = join(dir, "nested-target.md");

		await writeFileAtomic(target, "content\n");

		expect(readFileSync(target, "utf-8")).toBe("content\n");
		expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
			[],
		);
	});

	it("works with a directory name containing spaces", async () => {
		const base = makeTempDir();
		const spacedDir = join(base, "my project docs");
		await ensureDirectory(spacedDir);
		const target = join(spacedDir, "AC.md");

		await writeFileAtomic(target, "criteria\n");

		expect(readFileSync(target, "utf-8")).toBe("criteria\n");
		expect(readdirSync(spacedDir)).toEqual(["AC.md"]);
	});

	it("reports the target path when the write fails", async () => {
		const dir = makeTempDir();
		// A directory as the target cannot be renamed over, so the failure is real.
		const target = join(dir, "occupied.md");
		await ensureDirectory(target);

		await expect(writeFileAtomic(target, "x")).rejects.toThrow(/Cannot write/);
	});
});

describe("isPathInsideRoot", () => {
	it("accepts normal nested relative paths", () => {
		const root = join(tmpdir(), "prdfy-repo");

		expect(
			isPathInsideRoot(root, join(root, "docs", "vibeplan", "feature.md")),
		).toBe(true);
		expect(
			isPathInsideRoot(root, join(root, "docs", "vibeplan", "a-b", "PRD.md")),
		).toBe(true);
		// A relative candidate resolves against the root.
		expect(isPathInsideRoot(root, join("docs", "vibeplan", "tasks.json"))).toBe(
			true,
		);
	});

	it("rejects the root itself and traversal escapes", () => {
		const root = join(tmpdir(), "prdfy-repo");

		expect(isPathInsideRoot(root, root)).toBe(false);
		expect(isPathInsideRoot(root, join(root, ".."))).toBe(false);
		expect(
			isPathInsideRoot(root, join(root, "docs", "..", "..", "outside.md")),
		).toBe(false);
	});

	it("rejects absolute paths outside the root", () => {
		const root = join(tmpdir(), "prdfy-repo");
		const outside = join(tmpdir(), "prdfy-elsewhere", "AGENTS.md");

		expect(isPathInsideRoot(root, outside)).toBe(false);
	});

	it("rejects Windows drive and UNC paths that leave the root", () => {
		expect(
			isPathInsideRoot("C:\\repo", "C:\\repo\\docs\\vibeplan\\feature.md"),
		).toBe(true);
		expect(isPathInsideRoot("C:\\repo", "D:\\elsewhere\\AGENTS.md")).toBe(
			false,
		);
		expect(isPathInsideRoot("C:\\repo", "C:\\repo\\..\\..\\AGENTS.md")).toBe(
			false,
		);
		expect(isPathInsideRoot("C:\\repo", "\\\\server\\share\\x.md")).toBe(false);
	});

	it("rejects an empty root or candidate", () => {
		expect(isPathInsideRoot("", "docs/vibeplan/feature.md")).toBe(false);
		expect(isPathInsideRoot(join(tmpdir(), "repo"), "")).toBe(false);
	});
});

describe("ensureDirectory and readFileIfExists", () => {
	it("creates nested directories once and is idempotent", async () => {
		const root = makeTempDir();
		const nested = join(root, "docs", "vibeplan", "watchlist-abcd1234");

		await ensureDirectory(nested);
		await ensureDirectory(nested);

		expect(readdirSync(nested)).toEqual([]);
	});

	it("returns null for a missing file and the content for an existing one", async () => {
		const root = makeTempDir();
		const missing = join(root, "manifest.json");
		expect(await readFileIfExists(missing)).toBeNull();

		await writeFileAtomic(missing, "{}\n");
		expect(await readFileIfExists(missing)).toBe("{}\n");
	});
});
