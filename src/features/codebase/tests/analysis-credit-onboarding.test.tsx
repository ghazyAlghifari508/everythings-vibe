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
afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

test("preflight discloses cost before creating a CLI credential and requires explicit consent", async () => {
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
	const button = await screen.findByRole("button", {
		name: /Setujui hingga 12 kredit/,
	});
	assert.deepEqual(calls, ["GET /api/codebases?preflight=analysis"]);
	assert.equal(screen.queryByText(/Salin prompt ini/), null);
	fireEvent.click(button);
	await waitFor(() =>
		assert.equal(calls.filter((call) => call.startsWith("POST")).length, 1),
	);
});

test("insufficient credits prevent sync instructions and provide billing action", async () => {
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
	await screen.findByRole("link", { name: "Tambahkan Kredit" });
	assert.equal(
		screen.queryByRole("button", { name: /Sinkronisasi|Setujui/ }),
		null,
	);
	assert.equal(screen.queryByText(/Salin prompt ini/), null);
});
