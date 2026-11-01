// @vitest-environment jsdom
import assert from "node:assert/strict";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, test, vi } from "vitest";
import { PlanCodebasePage } from "../components/workspace/plan-codebase-page";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock("@/features/billing/hooks/use-user-plan", () => ({
	useUserPlan: () => ({ data: undefined, refetch: vi.fn() }),
}));
afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

test("sufficient credits show the normal sync layout with inline cost and app-owned consent", async () => {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${input}`);
			if (input === "/api/codebases?preflight=analysis")
				return Response.json({
					code: "CREDIT_REQUIRED",
					availableCredits: 30,
					maximumCredits: 12,
					pricingVersion: "adaptive-v1",
					canStart: false,
				});
			if (input === "/api/codebases" && init?.method === "POST") {
				assert.deepEqual(JSON.parse(String(init.body)), {
					acceptAnalysisPolicy: true,
					creditConsent: { maximumCredits: 12, pricingVersion: "adaptive-v1" },
				});
				return Response.json({ error: "Create unavailable" }, { status: 503 });
			}
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	render(<PlanCodebasePage />);
	await screen.findByText("Sync codebase dengan everythings-vibe");
	assert.deepEqual(calls, ["GET /api/codebases?preflight=analysis"]);
	assert.equal(screen.queryByText("Hubungkan repository"), null);
	assert.ok(screen.queryByText(/Analisis: maksimal 12 kredit/));
	const start = await screen.findByRole("button", {
		name: "Siapkan instruksi",
	});
	fireEvent.click(start);
	const checkbox = (await screen.findByLabelText(
		/Saya setuju analisis/,
	)) as HTMLInputElement;
	assert.equal(checkbox.checked, false);
	fireEvent.click(checkbox);
	const confirm = await screen.findByRole("button", {
		name: "Setuju dan lanjutkan",
	});
	fireEvent.click(confirm);
	await waitFor(() =>
		assert.equal(calls.filter((call) => call.startsWith("POST")).length, 1),
	);
});

test("insufficient credits keep the sync layout with a locked prompt and no raw token", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				code: "INSUFFICIENT_CREDITS",
				availableCredits: 2,
				maximumCredits: 12,
				pricingVersion: "adaptive-v1",
				canStart: false,
			}),
		),
	);
	render(<PlanCodebasePage />);
	await screen.findByText("Sync codebase dengan everythings-vibe");
	const locked = await screen.findByTestId("locked-prompt-region");
	assert.ok(locked.textContent?.includes("Kredit belum cukup"));
	assert.equal(document.body.innerHTML.includes("tok_"), false);
	assert.equal(document.body.innerHTML.includes("sync-token"), false);
	const topupBtn = await screen.findByRole("button", {
		name: "Tambahkan Kredit",
	});
	assert.ok(topupBtn);
	assert.equal(
		screen.queryByRole("button", { name: /Sinkronisasi|Setujui/ }),
		null,
	);
});

test("top-up action in locked prompt opens TopUpModal and can refresh eligibility", async () => {
	let preflightCount = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			if (input === "/api/codebases?preflight=analysis") {
				preflightCount += 1;
				if (preflightCount === 1) {
					return Response.json({
						code: "INSUFFICIENT_CREDITS",
						availableCredits: 2,
						maximumCredits: 12,
						pricingVersion: "adaptive-v1",
						canStart: false,
					});
				}
				return Response.json({
					code: "CREDIT_REQUIRED",
					availableCredits: 30,
					maximumCredits: 12,
					pricingVersion: "adaptive-v1",
					canStart: false,
				});
			}
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	render(<PlanCodebasePage />);
	const topupBtn = await screen.findByRole("button", {
		name: "Tambahkan Kredit",
	});
	fireEvent.click(topupBtn);
	const modalTitle = await screen.findByText("Isi Ulang Kredit");
	assert.ok(modalTitle);
	const closeBtn = screen.getByRole("button", { name: /Tutup modal/i });
	fireEvent.click(closeBtn);
	await waitFor(() => assert.equal(preflightCount, 2));
});

test("free allowance follows the normal sync flow with no billing warning", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				code: "FREE_ALLOWANCE_AVAILABLE",
				availableCredits: 2,
				maximumCredits: 0,
				pricingVersion: "adaptive-v1",
				canStart: true,
			}),
		),
	);
	render(<PlanCodebasePage />);
	await screen.findByText("Sync codebase dengan everythings-vibe");
	assert.equal(screen.queryByTestId("locked-prompt-region"), null);
	assert.ok(screen.queryByText(/Analisis awal gratis/));
	assert.equal(screen.queryByText(/Tambahkan Kredit/), null);
	const start = await screen.findByRole("button", {
		name: "Siapkan instruksi",
	});
	assert.ok(start);
});

test("no native browser confirm or alert remain in codebase feature source", async () => {
	const glob = await import("node:fs/promises");
	const files = [
		"src/features/codebase/services/analysis-credit-requests.ts",
		"src/features/codebase/hooks/use-codebase-onboarding.ts",
		"src/features/codebase/hooks/use-codebase-sync.ts",
		"src/features/codebase/hooks/use-workspace-analysis.ts",
		"src/features/codebase/components/workspace/plan-codebase-page.tsx",
		"src/features/codebase/components/planning/codebase-resync-modal.tsx",
	];
	for (const f of files) {
		const source = await glob.readFile(f, "utf8");
		assert.equal(
			source.includes("window.confirm"),
			false,
			`${f} still has window.confirm`,
		);
		assert.equal(
			source.includes("window.alert"),
			false,
			`${f} still has window.alert`,
		);
	}
});
