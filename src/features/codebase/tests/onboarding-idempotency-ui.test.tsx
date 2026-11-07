// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PlanCodebasePage } from "../components/workspace/plan-codebase-page";
import { readOnboardingRequestId } from "../services/onboarding-request-identity";

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
	window.history.replaceState({}, "");
	vi.unstubAllGlobals();
});
const credit = {
	code: "CREDIT_REQUIRED",
	availableCredits: 30,
	maximumCredits: 12,
	pricingVersion: "adaptive-v1",
	canStart: true,
	requiresApproval: false,
};
const prompt = {
	projectId: "repo",
	sessionId: "replacement",
	apiBaseUrl: "https://test.local",
	syncToken: "new-raw-token",
	syncCommand: "sync",
	cliMinVersion: "2.0.0",
	expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
const status = {
	projectId: "repo",
	sessionId: "original",
	status: "waiting_for_cli",
	snapshotId: null,
	codebaseName: "Repository",
	expiresAt: new Date(Date.now() + 3600000).toISOString(),
};

test("lost response and refresh recover the same repository without automatic credential rotation", async () => {
	const keys: string[] = [];
	const sessionBodies: object[] = [];
	let commitLost = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: RequestInit) => {
			if (input.includes("preflight")) return Response.json(credit);
			if (input === "/api/codebases") {
				keys.push(JSON.parse(String(init?.body)).requestId);
				if (!commitLost) {
					commitLost = true;
					throw new TypeError("response lost after commit");
				}
				return Response.json({
					id: "repo",
					name: "Repository",
					sessionId: "original",
					code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
				});
			}
			if (input.includes("/status")) return Response.json(status);
			if (input.endsWith("/session")) {
				const body = JSON.parse(String(init?.body));
				sessionBodies.push(body);
				return body.action === "recover"
					? Response.json(
							{
								code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
								sessionId: "original",
								error:
									"Token hanya dikirim sekali. Penggantian menonaktifkan token sebelumnya.",
							},
							{ status: 409 },
						)
					: Response.json(prompt);
			}
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	const first = render(<PlanCodebasePage intent="new" />);
	await screen.findByRole("button", { name: "Coba lagi" });
	const attempt = readOnboardingRequestId();
	first.unmount();
	render(<PlanCodebasePage intent="new" />);
	await screen.findByText(/Token hanya dikirim sekali/);
	expect(keys).toEqual([attempt, attempt]);
	expect(sessionBodies).toEqual([{ action: "recover" }]);
	fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	expect(sessionBodies).toEqual([
		{ action: "recover" },
		{ action: "retry", sessionId: "original" },
	]);
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
	expect(screen.queryByText("Menghubungkan repository...")).toBeNull();
	for (let i = 0; i < sessionStorage.length; i++)
		expect(sessionStorage.getItem(sessionStorage.key(i) ?? "")).not.toContain(
			prompt.syncToken,
		);
});

test("an intentional navigation creates a different attempt; rerenders and repeated create actions do not", async () => {
	const keys: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: RequestInit) => {
			if (input.includes("preflight")) return Response.json(credit);
			if (input === "/api/codebases") {
				keys.push(JSON.parse(String(init?.body)).requestId);
				return Response.json({ id: "repo", name: "Repository", sync: prompt });
			}
			if (input.includes("/status"))
				return Response.json({ ...status, sessionId: "replacement" });
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	const first = render(<PlanCodebasePage intent="new" />);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	first.rerender(<PlanCodebasePage intent="new" />);
	expect(keys.length).toBe(1);
	first.unmount();
	window.history.pushState({}, "", "/plan/codebase?intent=new");
	render(<PlanCodebasePage intent="new" />);
	await waitFor(() => expect(keys.length).toBe(2));
	expect(keys[1]).not.toBe(keys[0]);
});

test("a delayed success from an unmounted attempt cannot overwrite the newer repository pointer", async () => {
	// The project TypeScript lib predates Promise.withResolvers.
	let resolveOld: (response: Response) => void = () => {
		throw new Error("Deferred response was not initialized");
	};
	const oldResponse = new Promise<Response>((resolve) => {
		resolveOld = resolve;
	});
	let creates = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			if (input.includes("preflight")) return Response.json(credit);
			if (input === "/api/codebases") {
				creates += 1;
				if (creates === 1) return oldResponse;
				return Response.json({
					id: "new-repo",
					name: "New repository",
					sync: { ...prompt, projectId: "new-repo" },
				});
			}
			if (input.includes("/status"))
				return Response.json({
					...status,
					projectId: "new-repo",
					sessionId: prompt.sessionId,
				});
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	const old = render(<PlanCodebasePage intent="new" />);
	await waitFor(() => expect(creates).toBe(1));
	old.unmount();
	window.history.pushState({}, "", "/plan/codebase?intent=new");
	render(<PlanCodebasePage intent="new" />);
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	await act(async () => {
		resolveOld(
			Response.json({
				id: "old-repo",
				name: "Old repository",
				sync: { ...prompt, projectId: "old-repo" },
			}),
		);
	});
	expect(sessionStorage.getItem("prdfy:plan-codebase-id")).toBe("new-repo");
	expect(window.history.state.codebaseStartCodebase).toBe("new-repo");
	expect(creates).toBe(2);
});
