import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { CodebaseLibraryItem } from "@/features/codebase/services/library";

export function installRadixDomPolyfills() {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"DOMRect",
		class {
			x = 0;
			y = 0;
			width = 0;
			height = 0;
			top = 0;
			left = 0;
			right = 0;
			bottom = 0;
		},
	);
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

export function makeItem(
	id: string,
	name: string,
	overrides: Partial<CodebaseLibraryItem> = {},
): CodebaseLibraryItem {
	return {
		id,
		name,
		updatedAt: "2026-10-14T00:00:00.000Z",
		fileCount: 42,
		snapshotCreatedAt: "2026-10-14T00:00:00.000Z",
		snapshotStatus: "uploaded",
		summary: null,
		framework: "React",
		language: "TypeScript",
		packageManager: "pnpm",
		hasReadyAnalysis: true,
		hasUsableSnapshot: true,
		analysisAttemptStatus: "ready",
		onboardingProjectId: null,
		readiness: "planning_ready",
		planCount: 0,
		...overrides,
	};
}

let bulkDeleteCalls: string[][] = [];

export function readBulkDeleteCalls(): string[][] {
	return bulkDeleteCalls;
}

export function mockCodebaseBulkApi(
	customHandler?: (ids: string[]) => {
		deleted: number;
		skipped: number;
		deletedIds: string[];
	},
) {
	bulkDeleteCalls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/api/codebases") && method === "DELETE") {
				if (init?.body) {
					const parsed = JSON.parse(String(init.body));
					if (parsed.ids) {
						bulkDeleteCalls.push(parsed.ids);
						if (customHandler) {
							return {
								ok: true,
								status: 200,
								json: async () => ({
									success: true,
									...customHandler(parsed.ids),
								}),
							};
						}
						return {
							ok: true,
							status: 200,
							json: async () => ({
								success: true,
								deleted: parsed.ids.length,
								skipped: 0,
								deletedIds: parsed.ids,
							}),
						};
					}
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ success: true, deleted: true }),
				};
			}
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}),
	);
}

export function openActionsMenu(index = 0) {
	const triggers = screen.getAllByRole("button", { name: /Opsi repository/i });
	fireEvent.pointerDown(triggers[index], {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
}

export function enterSelectionMode(index = 0) {
	openActionsMenu(index);
	fireEvent.click(screen.getByRole("menuitem", { name: /^Pilih$/i }));
}
