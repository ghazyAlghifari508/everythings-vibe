// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
} from "@/lib/codebase-sync";
import { useUIStore } from "@/store";
import { PlanCodebasePage } from "./codebase";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

const PROMPT_HEADING = "Sync codebase dengan VibeEverything";
const ERROR_TITLE = "Gagal menyiapkan repository";
const LOADING_CARD_TEXT = "Menunggu sesi sync...";

function syncPayload() {
	return {
		projectId: "cb-new-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: "fresh-token",
		syncCommand:
			"vibeeverything codebase sync --project-id cb-new-1 --sync-token fresh-token",
		expiresAt: new Date(Date.now() + 3600000).toISOString(),
	};
}

function createdBody() {
	return {
		id: "cb-new-1",
		name: "Repository Lokal",
		sync: syncPayload(),
	};
}

/**
 * The loading card is the `<output>` element; the error card is a dialog-free
 * alert region. Both are located structurally so the assertions describe
 * rendered state instead of styling.
 */
function loadingCard(container: HTMLElement): HTMLElement | null {
	return container.querySelector("output");
}

function seedStalePointer() {
	sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, "cb-deleted-1");
	sessionStorage.setItem(PLAN_CODEBASE_NAME_STORAGE_KEY, "<sample deleted>");
	sessionStorage.setItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY, "proj-deleted-1");
}

beforeEach(() => {
	useUIStore.getState().setCodebasePlanStep("prompt");
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	sessionStorage.clear();
});

describe("PlanCodebasePage create failure state", () => {
	it("shows an error card with no loading card after a fresh create failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					return {
						ok: false,
						status: 500,
						json: async () => ({ error: "Gagal membuat codebase" }),
					};
				}
				throw new Error(`unexpected fetch ${String(input)}`);
			}),
		);

		const { container } = render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText(ERROR_TITLE)).toBeDefined();
		});
		// The reported defect: a terminal failure left the page claiming it was
		// still waiting for a session that was never created.
		expect(loadingCard(container)).toBeNull();
		expect(screen.queryByText(LOADING_CARD_TEXT)).toBeNull();
		expect(screen.queryByText(PROMPT_HEADING)).toBeNull();
		expect(screen.getByRole("button", { name: /Coba lagi/i })).toBeDefined();
	});

	it("surfaces the safe server message instead of a generic duplicate", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					return {
						ok: false,
						status: 400,
						json: async () => ({ error: "Nama codebase harus diisi" }),
					};
				}
				throw new Error(`unexpected fetch ${String(input)}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText("Nama codebase harus diisi")).toBeDefined();
		});
		expect(screen.queryByText(/Codebase gagal dibuat/)).toBeNull();
	});

	it("falls back to safe default copy when the server returns no message", async () => {
		// The server owns sanitisation (it logs the technical cause and answers
		// with a fixed message). The page must still say something actionable
		// when the response carries no usable `error`.
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					return {
						ok: false,
						status: 500,
						json: async () => ({}),
					};
				}
				throw new Error(`unexpected fetch ${String(input)}`);
			}),
		);

		const { container } = render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText(ERROR_TITLE)).toBeDefined();
		});
		expect(loadingCard(container)).toBeNull();
		expect(screen.getByRole("button", { name: /Coba lagi/i })).toBeDefined();
	});

	it("retries a fresh create from the error card without a page reload", async () => {
		let createCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					createCalls += 1;
					if (createCalls === 1) {
						return {
							ok: false,
							status: 500,
							json: async () => ({ error: "Gagal membuat codebase" }),
						};
					}
					return {
						ok: true,
						status: 200,
						json: async () => createdBody(),
					};
				}
				throw new Error(`unexpected fetch ${String(input)}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText(ERROR_TITLE)).toBeDefined();
		});
		screen.getByRole("button", { name: /Coba lagi/i }).click();

		await waitFor(
			() => {
				expect(screen.getByText(PROMPT_HEADING)).toBeDefined();
			},
			{ timeout: 15000 },
		);
		expect(createCalls).toBe(2);
		expect(screen.queryByText(ERROR_TITLE)).toBeNull();
	});

	it("does not fire duplicate create requests when retry is triggered twice", async () => {
		let createCalls = 0;
		// The successful retry never resolves on its own, so a second trigger
		// would stay in flight and be counted.
		vi.stubGlobal(
			"fetch",
			vi.fn((input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					createCalls += 1;
					if (createCalls === 1) {
						return Promise.resolve({
							ok: false,
							status: 500,
							json: async () => ({ error: "Gagal membuat codebase" }),
						});
					}
					return new Promise<Response>(() => {});
				}
				return Promise.reject(new Error(`unexpected fetch ${String(input)}`));
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText(ERROR_TITLE)).toBeDefined();
		});
		const retry = screen.getByRole("button", { name: /Coba lagi/i });
		retry.click();
		retry.click();

		await waitFor(() => {
			expect(createCalls).toBe(2);
		});
		// One initial failure plus exactly one in-flight retry.
		expect(createCalls).toBe(2);
	});
});

describe("PlanCodebasePage breadcrumb hierarchy", () => {
	it("nests the onboarding step under Project Tersimpan", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				if (String(input) === "/api/codebases" && init?.method === "POST") {
					return { ok: true, status: 200, json: async () => createdBody() };
				}
				throw new Error(`unexpected fetch ${String(input)}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByText(PROMPT_HEADING)).toBeDefined();
			},
			{ timeout: 15000 },
		);

		const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
		// Home > VibePlan > Project Tersimpan > Hubungkan Repository
		expect(crumbs.querySelector('a[href="/"]')).not.toBeNull();
		expect(crumbs.querySelector('a[href="/plan"]')).not.toBeNull();
		// The onboarding page is a child of the library, so the library is a
		// real link back to it rather than a dead end on VibePlan.
		expect(crumbs.querySelector('a[href="/codebases"]')).not.toBeNull();
		expect(crumbs.querySelectorAll("a")).toHaveLength(3);
		expect(crumbs.textContent).toContain("Hubungkan Repository");
		expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe(
			"Hubungkan Repository",
		);
		expect(crumbs.textContent).not.toContain("Codebase Existing");
	});
});

describe("PlanCodebasePage stale pointer recovery", () => {
	it("treats a 404 status as a stale pointer and creates a fresh codebase", async () => {
		seedStalePointer();
		let createCalls = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				if (url.includes("/api/codebases/cb-deleted-1/status")) {
					return {
						ok: false,
						status: 404,
						json: async () => ({ error: "Codebase tidak ditemukan" }),
					};
				}
				if (url === "/api/codebases" && init?.method === "POST") {
					createCalls += 1;
					return { ok: true, status: 200, json: async () => createdBody() };
				}
				throw new Error(`unexpected fetch ${init?.method ?? "GET"} ${url}`);
			}),
		);

		const { container } = render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(screen.getByText(PROMPT_HEADING)).toBeDefined();
			},
			{ timeout: 15000 },
		);
		expect(createCalls).toBe(1);
		// A stale pointer is an expected condition, not a user-facing failure.
		expect(screen.queryByText(ERROR_TITLE)).toBeNull();
		expect(loadingCard(container)).toBeNull();
	});

	it("clears the stale project pointer too so it cannot contaminate the new sync", async () => {
		seedStalePointer();
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: unknown, init?: { method?: string }) => {
				const url = String(input);
				if (url.includes("/api/codebases/cb-deleted-1/status")) {
					return {
						ok: false,
						status: 404,
						json: async () => ({ error: "Codebase tidak ditemukan" }),
					};
				}
				if (url === "/api/codebases" && init?.method === "POST") {
					return { ok: true, status: 200, json: async () => createdBody() };
				}
				// The onboarding analysis project is created only for the NEW
				// codebase. A stale project id would be reused here instead.
				if (url === "/api/codebases/cb-new-1/features") {
					return {
						ok: true,
						status: 200,
						json: async () => ({ projectId: "proj-new-1" }),
					};
				}
				throw new Error(`unexpected fetch ${init?.method ?? "GET"} ${url}`);
			}),
		);

		render(<PlanCodebasePage />);

		await waitFor(
			() => {
				expect(sessionStorage.getItem(PLAN_CODEBASE_ID_STORAGE_KEY)).toBe(
					"cb-new-1",
				);
			},
			{ timeout: 15000 },
		);
		expect(screen.queryByText(ERROR_TITLE)).toBeNull();
	});
});
