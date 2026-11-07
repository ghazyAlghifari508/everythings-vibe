// @vitest-environment jsdom
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
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

const SYNC_TOKEN = "sync-token-secret-value";
const PREFLIGHT = "/api/codebases?preflight=analysis";

type Status = Record<string, unknown>;

function creditStatus(overrides: Status): Status {
	return {
		code: "CREDIT_REQUIRED",
		availableCredits: 30,
		maximumCredits: 12,
		pricingVersion: "adaptive-v1",
		canStart: true,
		requiresApproval: false,
		...overrides,
	};
}

function syncPayload() {
	return {
		projectId: "cb-1",
		sessionId: "sess-1",
		apiBaseUrl: "http://localhost:3000",
		syncToken: SYNC_TOKEN,
		syncCommand: `everythings-vibe codebase sync --project-id cb-1 --sync-token ${SYNC_TOKEN}`,
		cliMinVersion: "0.1.0",
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
	};
}

function createdCodebase() {
	return { id: "cb-1", name: "Repo Lokal", sync: syncPayload() };
}

function statusResponse(): Status {
	return {
		projectId: "cb-1",
		sessionId: "sess-1",
		status: "waiting_for_cli",
		snapshotId: null,
	};
}

/**
 * Stubs the three endpoints this page owns and records what it asked for, so a
 * test can prove a credential was never minted and no analysis was started.
 */
function stubBackend(handler: (input: string, init?: RequestInit) => Status) {
	const calls: { method: string; url: string; body?: string }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: RequestInit) => {
			calls.push({
				method: init?.method ?? "GET",
				url: input,
				body: typeof init?.body === "string" ? init.body : undefined,
			});
			return Response.json(handler(input, init));
		}),
	);
	return calls;
}

test("sufficient credits land straight on the prompt with no approval step", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({});
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);

	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.ok(screen.getByText(new RegExp(SYNC_TOKEN)));
	assert.equal(screen.queryByText("Siapkan instruksi"), null);
	assert.equal(screen.queryByTestId("credit-consent-dialog"), null);
	assert.equal(screen.queryByRole("checkbox"), null);
	assert.equal(screen.queryByTestId("locked-prompt-region"), null);
	// Rate transparency survives as one muted line, not a card or a modal.
	assert.ok(screen.getByText(/Analisis hingga 12 kredit/));

	// A standing authorization means the start request carries no fresh consent.
	const create = calls.find((call) => call.url === "/api/codebases");
	assert.ok(create?.body);
	assert.equal(
		Object.hasOwn(JSON.parse(String(create.body)), "creditConsent"),
		false,
	);
});

test("insufficient credits lock the prompt and never mint a credential", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT)
			return creditStatus({
				code: "INSUFFICIENT_CREDITS",
				availableCredits: 2,
				canStart: false,
			});
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);

	const locked = await screen.findByTestId("locked-prompt-region");
	assert.equal(locked.getAttribute("data-locked-variant"), "insufficient");
	assert.ok(locked.textContent?.includes("Kredit tidak mencukupi"));
	assert.ok(locked.textContent?.includes("Tambahkan kredit untuk melanjutkan"));
	assert.ok(
		await screen.findByRole("button", { name: "Tambahkan Kredit" }),
		"the locked prompt must offer the top-up action",
	);
	assert.equal(document.body.innerHTML.includes(SYNC_TOKEN), false);
	assert.equal(
		calls.some((call) => call.method === "POST"),
		false,
		"an ineligible account must not mint a session",
	);
	assert.equal(screen.queryByRole("checkbox"), null);
});

test("top-up opens the real billing flow and unlocks from server state", async () => {
	let preflightCount = 0;
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) {
			preflightCount += 1;
			return preflightCount === 1
				? creditStatus({
						code: "INSUFFICIENT_CREDITS",
						availableCredits: 2,
						canStart: false,
					})
				: creditStatus({});
		}
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);

	fireEvent.click(
		await screen.findByRole("button", { name: "Tambahkan Kredit" }),
	);
	assert.ok(await screen.findByText("Isi Ulang Kredit"));
	fireEvent.click(screen.getByRole("button", { name: /Tutup modal/i }));

	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(preflightCount, 2);
	assert.equal(
		calls.filter(
			(call) => call.method === "POST" && call.url === "/api/codebases",
		).length,
		1,
	);
});

test("billing-exempt accounts run the normal sync without a credit gate", async () => {
	stubBackend((input) => {
		if (input === PREFLIGHT)
			return creditStatus({
				code: "FREE_ALLOWANCE_AVAILABLE",
				maximumCredits: 0,
				availableCredits: 0,
				billingExempt: true,
			});
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);

	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(screen.queryByTestId("locked-prompt-region"), null);
	assert.equal(screen.queryByText("Tambahkan Kredit"), null);
	assert.equal(screen.queryByText(/Analisis hingga/), null);
});

test("legacy approval flag cannot add a step to an eligible account", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({ requiresApproval: true });
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(screen.queryByRole("checkbox"), null);
	assert.equal(screen.queryByTestId("locked-prompt-region"), null);
	const create = calls.find((call) => call.url === "/api/codebases");
	assert.equal(
		Object.hasOwn(JSON.parse(String(create?.body)), "creditConsent"),
		false,
	);
});

test("a rerender does not mint a second sync session", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({});
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	const rendered = render(<PlanCodebasePage />);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	rendered.rerender(<PlanCodebasePage />);
	rendered.rerender(<PlanCodebasePage />);
	await waitFor(() =>
		assert.equal(
			calls.filter(
				(call) => call.method === "POST" && call.url === "/api/codebases",
			).length,
			1,
		),
	);
});

test("opening the screen never starts a billable analysis", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({});
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(
		calls.some((call) => call.url.includes("/codebase/analysis")),
		false,
	);
});

test("Strict Mode and remount recover the same prompt without another codebase", async () => {
	const calls = stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({});
		if (input === "/api/codebases") return createdCodebase();
		if (input.includes("/status")) return statusResponse();
		if (input.endsWith("/session")) return syncPayload();
		throw new Error(`Unexpected request ${input}`);
	});
	const first = render(
		<StrictMode>
			<PlanCodebasePage intent="new" />
		</StrictMode>,
	);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	first.unmount();
	render(
		<StrictMode>
			<PlanCodebasePage intent="new" />
		</StrictMode>,
	);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(
		calls.filter(
			(call) => call.method === "POST" && call.url === "/api/codebases",
		).length,
		1,
	);
	assert.ok(screen.getByText(new RegExp(SYNC_TOKEN)));
});

test("failed session preparation offers a working retry", async () => {
	let attempts = 0;
	stubBackend((input) => {
		if (input === PREFLIGHT) return creditStatus({});
		if (input === "/api/codebases")
			return ++attempts === 1
				? { error: "Session unavailable" }
				: createdCodebase();
		if (input.includes("/status")) return statusResponse();
		throw new Error(`Unexpected request ${input}`);
	});
	render(<PlanCodebasePage />);
	fireEvent.click(await screen.findByRole("button", { name: "Coba lagi" }));
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	assert.equal(attempts, 2);
});

test("a delayed create response cannot overwrite a newer navigation", async () => {
	const events = new EventEmitter();
	const pending = once(events, "response");
	let requested = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			if (input === PREFLIGHT) return Response.json(creditStatus({}));
			if (input === "/api/codebases") {
				requested = true;
				await pending;
				return Response.json(createdCodebase());
			}
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	const page = render(<PlanCodebasePage intent="new" />);
	await waitFor(() => assert.ok(requested));
	page.unmount();
	window.history.replaceState(
		{ codebaseStartRequest: crypto.randomUUID() },
		"",
	);
	events.emit("response");
	await pending;
	await delay(0);
	assert.equal(sessionStorage.getItem("prdfy:plan-codebase-id"), null);
});
