// @vitest-environment jsdom
// FIX 03 — the recovery presentation, its exact approved copy, and the sync
// header without a repository eyebrow. Component + page level only: no browser,
// no screenshot, no visual snapshot. Assertions stay on the product contract
// (copy, states, ownership, accessibility), never on CSS class lists.
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PlanCodebasePage } from "../components/workspace/plan-codebase-page";
import { buildPromptRecoveryState } from "../components/workspace/prompt-recovery-state";
import { ScreenConnect } from "../components/workspace/screen-connect";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";
import { clearSyncPromptVault } from "../services/sync-prompt-vault";

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
	clearSyncPromptVault();
	sessionStorage.clear();
	window.history.replaceState({}, "");
	vi.unstubAllGlobals();
});

const CREDIT = {
	code: "CREDIT_REQUIRED",
	availableCredits: 30,
	maximumCredits: 12,
	pricingVersion: "adaptive-v1",
	canStart: true,
	requiresApproval: false,
};

const REPLACEMENT_PROMPT: SyncPromptPayload = {
	projectId: "repo",
	sessionId: "replacement",
	apiBaseUrl: "https://test.local",
	syncToken: "fresh-raw-token",
	syncCommand: "sync",
	cliMinVersion: "2.0.0",
	expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

const LIVE_PROMPT: SyncPromptPayload = {
	...REPLACEMENT_PROMPT,
	sessionId: "session-live",
	syncToken: "token-session-live",
};

function status(
	overrides: Partial<SyncStatusResponse> = {},
): SyncStatusResponse {
	return {
		projectId: "repo",
		sessionId: "original",
		status: "waiting_for_cli",
		snapshotId: null,
		...overrides,
	};
}

/** The onboarding page landing in a recoverable state: the repository exists,
 * but this app instance holds no credential for its session. */
function stubRecoverableRepository(
	session: () => Promise<Response> | Response = () =>
		Response.json(REPLACEMENT_PROMPT),
) {
	let creates = 0;
	const sessionBodies: unknown[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: RequestInit) => {
			if (input.includes("preflight")) return Response.json(CREDIT);
			if (input === "/api/codebases") {
				creates += 1;
				return Response.json({
					id: "repo",
					name: "Repository",
					sessionId: "original",
					code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
				});
			}
			if (input.includes("/status")) return Response.json(status());
			if (input.endsWith("/session")) {
				sessionBodies.push(JSON.parse(String(init?.body)));
				return session();
			}
			throw new Error(`Unexpected request ${input}`);
		}),
	);
	return { creates: () => creates, sessionBodies };
}

test("state A: an unavailable prompt is a recovery with the approved copy, not an error", async () => {
	stubRecoverableRepository();
	render(<PlanCodebasePage intent="new" />);

	// 1-3: exact heading, description, and action label.
	expect(
		await screen.findByText("Instruksi sync sebelumnya tidak tersedia."),
	).toBeDefined();
	expect(
		screen.getByText("Buat instruksi baru untuk melanjutkan."),
	).toBeDefined();
	expect(
		screen.getByRole("button", { name: "Buat instruksi baru" }),
	).toBeDefined();
	expect(
		screen.getByText("Instruksi sebelumnya tidak berlaku setelah diganti."),
	).toBeDefined();

	// 4: expected recovery is not an error, and none of the rejected technical
	// wording survives.
	expect(screen.queryByRole("alert")).toBeNull();
	const text = document.body.textContent ?? "";
	for (const rejected of [
		"Token sebelumnya hanya dikirim sekali",
		"sesi pengganti",
		"dinonaktifkan",
		"Recovery required",
		"Generate credential",
		"Perbarui otorisasi",
		"Restore session",
	])
		expect(text).not.toContain(rejected);

	// 19: one reused state inside the existing prompt box — no second card, no
	// modal, no overlay, no recreated primitive.
	const regions = screen.getAllByTestId("locked-prompt-region");
	expect(regions).toHaveLength(1);
	expect(regions[0]?.parentElement?.dataset.testid).toBe("prompt-box");
	expect(screen.getByText("Salin instruksi untuk AI agent")).toBeDefined();
	expect(screen.queryByRole("dialog")).toBeNull();

	// 16: no credit approval/consent control comes back with the recovery state.
	expect(screen.queryByRole("checkbox")).toBeNull();
	expect(screen.queryByText("Tambahkan Kredit")).toBeNull();
});

test("state B: an expired session shows its own heading and one action", async () => {
	const backend = stubRecoverableRepository(() =>
		Response.json(
			{
				code: "SYNC_SESSION_EXPIRED",
				sessionId: "original",
				error: "Sesi sinkronisasi berakhir.",
			},
			{ status: 409 },
		),
	);
	render(<PlanCodebasePage intent="new" />);

	fireEvent.click(
		await screen.findByRole("button", { name: "Buat instruksi baru" }),
	);

	expect(await screen.findByText("Sesi sinkronisasi berakhir")).toBeDefined();
	expect(
		screen.getByText(
			"Buat instruksi baru untuk melanjutkan sinkronisasi repository ini.",
		),
	).toBeDefined();
	expect(
		screen.getByRole("button", { name: "Buat instruksi baru" }),
	).toBeDefined();
	// No unrelated technical explanation, and no error treatment.
	expect(
		screen.queryByText("Instruksi sebelumnya tidak berlaku setelah diganti."),
	).toBeNull();
	expect(screen.queryByRole("alert")).toBeNull();
	// The expired session was re-requested on the same repository, and no second
	// repository was created along the way.
	expect(backend.sessionBodies).toEqual([
		{ action: "retry", sessionId: "original" },
	]);
	expect(backend.creates()).toBe(1);
});

test("state C to D: the spinner runs only while the replacement is genuinely pending", async () => {
	// The project TypeScript lib predates Promise.withResolvers.
	let release: (response: Response) => void = () => {
		throw new Error("Deferred response was not initialized");
	};
	const pending = new Promise<Response>((resolve) => {
		release = resolve;
	});
	const backend = stubRecoverableRepository(() => pending);
	render(<PlanCodebasePage intent="new" />);

	fireEvent.click(
		await screen.findByRole("button", { name: "Buat instruksi baru" }),
	);

	// 7: real pending request → label + spinner, and no action to double-click.
	await waitFor(() =>
		expect(
			screen.getByTestId("locked-prompt-region").dataset.lockedVariant,
		).toBe("pending"),
	);
	expect(screen.getByText("Menyiapkan instruksi baru...")).toBeDefined();
	expect(screen.getByTestId("spinner")).toBeDefined();
	expect(
		screen.queryByRole("button", { name: "Buat instruksi baru" }),
	).toBeNull();

	await act(async () => {
		release(Response.json(REPLACEMENT_PROMPT));
	});

	// 8-9: the real credential replaces the recovery message, and the recovery
	// copy is gone — with no success card standing in for it.
	await screen.findByRole("button", { name: "Salin prompt untuk AI agent" });
	expect(document.body.textContent).toContain("fresh-raw-token");
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
	expect(screen.queryByText("Menyiapkan instruksi baru...")).toBeNull();
	expect(
		screen.queryByText("Instruksi sync sebelumnya tidak tersedia."),
	).toBeNull();

	// 17: the replacement targeted the same repository and session.
	expect(backend.sessionBodies).toEqual([
		{ action: "retry", sessionId: "original" },
	]);
	expect(backend.creates()).toBe(1);
});

test("state E: only a failed request reports failure, with one retry that keeps the repository", async () => {
	const backend = stubRecoverableRepository(() =>
		Response.json({ error: "Sesi sync gagal dibuat." }, { status: 503 }),
	);
	render(<PlanCodebasePage intent="new" />);

	fireEvent.click(
		await screen.findByRole("button", { name: "Buat instruksi baru" }),
	);

	// 5-6: exact failure title, description, and single retry action.
	expect(
		await screen.findByText("Instruksi belum berhasil dibuat"),
	).toBeDefined();
	expect(
		screen.getByText("Permintaan belum berhasil. Coba buat instruksi lagi."),
	).toBeDefined();
	const retry = screen.getByRole("button", { name: "Coba lagi" });
	expect(screen.getAllByRole("button", { name: "Coba lagi" })).toHaveLength(1);
	expect(screen.queryByRole("alert")).toBeNull();

	// 18: the recovery action is a real, focusable button (keyboard reachable),
	// and the failure is stated once with no focus trap.
	retry.focus();
	expect(document.activeElement).toBe(retry);
	expect(retry.tagName).toBe("BUTTON");
	expect(
		screen.getByTestId("locked-prompt-region").querySelector("*[tabindex]"),
	).toBeNull();

	expect(backend.creates()).toBe(1);
});

test("state F: a live CLI never offers a replacement", () => {
	render(
		<ScreenConnect
			projectName="repo"
			payload={null}
			status={status({ status: "connected" })}
			lockedPrompt={buildPromptRecoveryState("unavailable", () => {
				throw new Error("an active session must never be replaced");
			})}
		/>,
	);

	// 10: no replacement action while the CLI is genuinely mid-sync, and no status
	// sentence standing in for a prompt that this browser does not hold.
	expect(screen.getByText("Repository sedang disinkronkan.")).toBeDefined();
	expect(screen.getByText("Pantau progresnya di bawah.")).toBeDefined();
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
	expect(
		screen.queryByRole("button", { name: "Buat instruksi baru" }),
	).toBeNull();
	expect(screen.queryByRole("button", { name: "Coba lagi" })).toBeNull();
});

test("state G: a stored upload reports receipt and requires no further prompt", () => {
	render(
		<ScreenConnect
			projectName="repo"
			payload={null}
			status={status({ status: "uploaded", snapshotId: "snapshot-1" })}
			onRequestNewToken={() => {
				throw new Error("a stored upload must not mint another prompt");
			}}
		/>,
	);

	// 11: the transport is done, and that is reported by the progress section
	// only. The prompt row states what it is — a credential this browser no
	// longer holds — instead of a success message or a dead renewal action.
	const promptBox = within(screen.getByTestId("prompt-box"));
	expect(promptBox.getByText("Sinkronisasi selesai.")).toBeDefined();
	expect(promptBox.queryByText("Source code berhasil diterima.")).toBeNull();
	expect(
		screen.queryByRole("button", { name: "Buat instruksi baru" }),
	).toBeNull();
	expect(screen.queryByTestId("locked-prompt-region")).toBeNull();
});

test("the sync header carries no repository eyebrow, placeholder, or extra subtitle", () => {
	const { container } = render(
		<ScreenConnect
			projectName="Repository Lokal"
			payload={LIVE_PROMPT}
			status={status()}
		/>,
	);
	const text = container.textContent ?? "";

	// 12-14: approved heading + description only.
	expect(
		screen.getByText("Sync codebase dengan everythings-vibe"),
	).toBeDefined();
	expect(
		screen.getByText(
			"Salin instruksi berikut, lalu jalankan melalui AI coding agent di root repository kamu.",
		),
	).toBeDefined();
	expect(text).not.toContain("Project /");
	expect(text).not.toContain("Repository belum terdeteksi");
	expect(text).not.toContain("Repository Lokal");
	expect(
		screen.queryByText("Salin instruksi untuk AI agent")?.textContent,
	).toBe("Salin instruksi untuk AI agent");
});

test("the prompt copy action still copies the live credential", async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
	render(
		<ScreenConnect
			projectName="repo"
			payload={LIVE_PROMPT}
			status={status()}
		/>,
	);

	// 15: reuse of the existing copy interaction, not a new one.
	fireEvent.click(
		screen.getByRole("button", { name: "Salin prompt untuk AI agent" }),
	);
	await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
	expect(String(writeText.mock.calls[0]?.[0])).toContain("token-session-live");
});
