import { describe, expect, test } from "vitest";
import {
	detectStackFromDependencies,
	detectStackFromPackageJsonText,
	manifestToExplorerFiles,
	mergeStackWithFallback,
} from "./codebase-stack";

describe("detectStackFromDependencies", () => {
	test("maps dependency keys to stack labels deterministically", () => {
		expect(
			detectStackFromDependencies(["react", "vite", "tailwindcss"]),
		).toEqual(["React", "Vite", "Tailwind"]);
	});

	test("returns empty list for empty input", () => {
		expect(detectStackFromDependencies([])).toEqual([]);
	});

	test("ignores unknown dependencies without inventing labels", () => {
		expect(detectStackFromDependencies(["left-pad-xyz"])).toEqual([]);
	});
});

describe("detectStackFromPackageJsonText", () => {
	test("extracts stack from dependencies and devDependencies", () => {
		const text = JSON.stringify({
			dependencies: { react: "^19.0.0", vite: "^6.0.0" },
			devDependencies: { tailwindcss: "^4.0.0", typescript: "^5.0.0" },
		});
		expect(detectStackFromPackageJsonText(text)).toEqual([
			"React",
			"Vite",
			"Tailwind",
			"TypeScript",
		]);
	});

	test("returns empty list for invalid JSON", () => {
		expect(detectStackFromPackageJsonText("not-json")).toEqual([]);
	});

	test("returns empty list for null input", () => {
		expect(detectStackFromPackageJsonText(null)).toEqual([]);
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

describe("mergeStackWithFallback", () => {
	test("prefers primary stack when present", () => {
		expect(mergeStackWithFallback(["React"], ["Vue"])).toEqual(["React"]);
	});

	test("falls back when primary is empty", () => {
		expect(mergeStackWithFallback([], ["Vue"])).toEqual(["Vue"]);
	});
});
