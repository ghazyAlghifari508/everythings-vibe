// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildTree,
	CodebaseExplorerSidebar,
	compareExplorerTreeNodes,
	type ExplorerFileEntry,
	filterExplorerFiles,
	sortTreeNodes,
	type TreeNode,
} from "./codebase-explorer-sidebar";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
});

describe("compareExplorerTreeNodes", () => {
	it("places directories before files regardless of alphabetical order", () => {
		const dir: TreeNode = {
			name: "zeta-dir",
			fullPath: "zeta-dir",
			isFile: false,
			children: [],
		};
		const file: TreeNode = {
			name: "alpha-file.ts",
			fullPath: "alpha-file.ts",
			isFile: true,
			children: [],
		};

		expect(compareExplorerTreeNodes(dir, file)).toBe(-1);
		expect(compareExplorerTreeNodes(file, dir)).toBe(1);
	});

	it("sorts files alphabetically using natural numeric sorting", () => {
		const f2: TreeNode = {
			name: "file2.ts",
			fullPath: "file2.ts",
			isFile: true,
			children: [],
		};
		const f10: TreeNode = {
			name: "file10.ts",
			fullPath: "file10.ts",
			isFile: true,
			children: [],
		};

		expect(compareExplorerTreeNodes(f2, f10)).toBeLessThan(0);
		expect(compareExplorerTreeNodes(f10, f2)).toBeGreaterThan(0);
	});

	it("sorts directories alphabetically using natural numeric sorting", () => {
		const d2: TreeNode = {
			name: "folder2",
			fullPath: "folder2",
			isFile: false,
			children: [],
		};
		const d10: TreeNode = {
			name: "folder10",
			fullPath: "folder10",
			isFile: false,
			children: [],
		};

		expect(compareExplorerTreeNodes(d2, d10)).toBeLessThan(0);
	});

	it("has deterministic tie-breaker when base case matches", () => {
		const upper: TreeNode = {
			name: "FILE.ts",
			fullPath: "FILE.ts",
			isFile: true,
			children: [],
		};
		const lower: TreeNode = {
			name: "file.ts",
			fullPath: "file.ts",
			isFile: true,
			children: [],
		};

		const cmp1 = compareExplorerTreeNodes(upper, lower);
		const cmp2 = compareExplorerTreeNodes(lower, upper);
		expect(cmp1).not.toBe(0);
		expect(cmp1).toBe(-cmp2);
	});
});

describe("buildTree and sortTreeNodes", () => {
	it("sorts tree nodes recursively without mutating original array", () => {
		const rawNodes: TreeNode[] = [
			{
				name: "index.html",
				fullPath: "index.html",
				isFile: true,
				children: [],
			},
			{
				name: "src",
				fullPath: "src",
				isFile: false,
				children: [
					{
						name: "main.tsx",
						fullPath: "src/main.tsx",
						isFile: true,
						children: [],
					},
					{
						name: "components",
						fullPath: "src/components",
						isFile: false,
						children: [],
					},
				],
			},
		];

		const sorted = sortTreeNodes(rawNodes);
		expect(sorted[0].name).toBe("src");
		expect(sorted[1].name).toBe("index.html");
		expect(sorted[0].children[0].name).toBe("components");
		expect(sorted[0].children[1].name).toBe("main.tsx");
	});

	it("orders root directories first, root files second, and alphabetical within each group", () => {
		const input: ExplorerFileEntry[] = [
			{ path: "README.md" },
			{ path: "vite.config.js" },
			{ path: "src/App.jsx" },
			{ path: "public/vite.svg" },
			{ path: "package.json" },
			{ path: "src/components/Button.jsx" },
			{ path: "src/assets/react.svg" },
		];

		const tree = buildTree(input);

		// Roots: public/, src/, package.json, README.md, vite.config.js
		expect(tree.map((n) => ({ name: n.name, isFile: n.isFile }))).toEqual([
			{ name: "public", isFile: false },
			{ name: "src", isFile: false },
			{ name: "package.json", isFile: true },
			{ name: "README.md", isFile: true },
			{ name: "vite.config.js", isFile: true },
		]);
	});

	it("applies canonical sorting recursively at every directory level", () => {
		const input: ExplorerFileEntry[] = [
			{ path: "src/index.ts" },
			{ path: "src/utils/math.ts" },
			{ path: "src/components/Card.tsx" },
			{ path: "src/components/Button.tsx" },
			{ path: "src/assets/logo.png" },
			{ path: "src/App.tsx" },
		];

		const tree = buildTree(input);
		const srcNode = tree.find((n) => n.name === "src");
		expect(srcNode).toBeDefined();

		// Inside src: assets/, components/, utils/, App.tsx, index.ts
		expect(
			srcNode?.children.map((c) => ({ name: c.name, isFile: c.isFile })),
		).toEqual([
			{ name: "assets", isFile: false },
			{ name: "components", isFile: false },
			{ name: "utils", isFile: false },
			{ name: "App.tsx", isFile: true },
			{ name: "index.ts", isFile: true },
		]);

		// Inside components: Button.tsx, Card.tsx
		const componentsNode = srcNode?.children.find(
			(c) => c.name === "components",
		);
		expect(componentsNode?.children.map((c) => c.name)).toEqual([
			"Button.tsx",
			"Card.tsx",
		]);
	});

	it("correctly classifies extensionless root entries as files (not directories)", () => {
		const input: ExplorerFileEntry[] = [
			{ path: "Dockerfile" },
			{ path: "LICENSE" },
			{ path: "Makefile" },
			{ path: "src/main.rs" },
		];

		const tree = buildTree(input);

		expect(tree.map((n) => ({ name: n.name, isFile: n.isFile }))).toEqual([
			{ name: "src", isFile: false },
			{ name: "Dockerfile", isFile: true },
			{ name: "LICENSE", isFile: true },
			{ name: "Makefile", isFile: true },
		]);
	});

	it("does not mutate the input array or its entries", () => {
		const input: ExplorerFileEntry[] = Object.freeze([
			Object.freeze({ path: "b.txt" }),
			Object.freeze({ path: "a.txt" }),
		]) as unknown as ExplorerFileEntry[];

		const tree = buildTree(input);
		expect(tree.map((n) => n.name)).toEqual(["a.txt", "b.txt"]);
		expect(input[0].path).toBe("b.txt");
		expect(input[1].path).toBe("a.txt");
	});

	it("preserves canonical ordering when filtered by search", () => {
		const input: ExplorerFileEntry[] = [
			{ path: "src/styles/app.css" },
			{ path: "src/components/Header.css" },
			{ path: "public/global.css" },
			{ path: "tailwind.config.js" },
		];

		const filtered = filterExplorerFiles(input, "css");
		const tree = buildTree(filtered);

		// public/, src/ before files, both sorted
		expect(tree.map((n) => ({ name: n.name, isFile: n.isFile }))).toEqual([
			{ name: "public", isFile: false },
			{ name: "src", isFile: false },
		]);
	});
});

describe("CodebaseExplorerSidebar component integration", () => {
	const sampleFiles: ExplorerFileEntry[] = [
		{ path: "README.md", summary: "Project Readme" },
		{ path: "Dockerfile", summary: "Docker build definition" },
		{ path: "src/App.tsx", summary: "Root application" },
		{ path: "src/index.ts", summary: "Entry point" },
	];

	it("renders directory nodes and extensionless file nodes properly", () => {
		const onSelectFile = vi.fn();
		act(() => {
			root?.render(
				<CodebaseExplorerSidebar
					files={sampleFiles}
					stack={["react", "typescript"]}
					onSelectFile={onSelectFile}
				/>,
			);
		});

		const text = container.textContent ?? "";
		expect(text).toContain("src");
		expect(text).toContain("Dockerfile");
		expect(text).toContain("README.md");

		// Click on a file leaf (Dockerfile)
		const dockerfileButton = [...container.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Dockerfile",
		);
		expect(dockerfileButton).toBeDefined();
		act(() => {
			dockerfileButton?.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		expect(onSelectFile).toHaveBeenCalledWith("Dockerfile");
	});

	it("supports expand and collapse of folders", () => {
		act(() => {
			root?.render(<CodebaseExplorerSidebar files={sampleFiles} stack={[]} />);
		});

		// At depth 0, folder 'src' is expanded by default (depth < 2)
		expect(container.textContent).toContain("App.tsx");

		const srcFolderButton = [...container.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "src",
		);
		expect(srcFolderButton).toBeDefined();
		expect(srcFolderButton?.getAttribute("aria-expanded")).toBe("true");

		// Click to collapse
		act(() => {
			srcFolderButton?.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		expect(srcFolderButton?.getAttribute("aria-expanded")).toBe("false");
		expect(container.textContent).not.toContain("App.tsx");

		// Click again to expand
		act(() => {
			srcFolderButton?.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		expect(srcFolderButton?.getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toContain("App.tsx");
	});

	it("filters files dynamically with the search input", () => {
		act(() => {
			root?.render(<CodebaseExplorerSidebar files={sampleFiles} stack={[]} />);
		});

		const searchInput = container.querySelector<HTMLInputElement>(
			"#codebase-file-search",
		);
		expect(searchInput).toBeDefined();

		act(() => {
			if (searchInput) {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(searchInput, "docker");
				searchInput.dispatchEvent(new Event("input", { bubbles: true }));
				searchInput.dispatchEvent(new Event("change", { bubbles: true }));
			}
		});

		expect(container.textContent).toContain("Dockerfile");
		expect(container.textContent).not.toContain("README.md");
	});

	it("keeps search first and drops the duplicated repository card", () => {
		act(() => {
			root?.render(
				<CodebaseExplorerSidebar files={sampleFiles} stack={["react"]} />,
			);
		});

		// Search, tree, and detected stack stay.
		const searchInput = container.querySelector<HTMLInputElement>(
			"#codebase-file-search",
		);
		expect(searchInput).not.toBeNull();
		const header = container.querySelector(
			"[data-testid='codebase-explorer-sidebar'] > div",
		);
		expect(header?.firstElementChild?.contains(searchInput)).toBe(true);
		expect(container.textContent).toContain("Struktur direktori codebase");
		expect(container.textContent).toContain("Stack codebase terdeteksi");
		expect(container.textContent).toContain("react");

		// The repository identity card is gone: the workspace header owns it.
		expect(
			container.querySelector("[data-testid='codebase-explorer-name']"),
		).toBeNull();
		expect(container.textContent).not.toContain("Synced");
		expect(container.textContent).not.toContain("Branch:");
	});

	it("keeps the honest empty state for search and for an unsynced snapshot", () => {
		act(() => {
			root?.render(<CodebaseExplorerSidebar files={sampleFiles} stack={[]} />);
		});

		act(() => {
			const searchInput = container.querySelector<HTMLInputElement>(
				"#codebase-file-search",
			);
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(searchInput, "tidak-ada");
			searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(
			container.querySelector("[data-testid='codebase-explorer-empty']")
				?.textContent,
		).toBe("Tidak ada file yang cocok dengan pencarian.");

		act(() => {
			root?.render(<CodebaseExplorerSidebar files={[]} stack={[]} />);
		});
		const searchInput = container.querySelector<HTMLInputElement>(
			"#codebase-file-search",
		);
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(searchInput, "");
			searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(
			container.querySelector("[data-testid='codebase-explorer-empty']")
				?.textContent,
		).toBe("Belum ada file terindeks dari snapshot.");
	});
});
