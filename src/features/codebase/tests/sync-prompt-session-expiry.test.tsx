// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenConnectPromptStep } from "../components/workspace/screen-connect-prompt-step";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	container = null;
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function payload(sessionId: string, expiresAt: string) {
	return {
		projectId: "cb_p2",
		sessionId,
		apiBaseUrl: "http://localhost:3000",
		syncToken: `token-${sessionId}`,
		syncCommand: `everythings-vibe codebase sync --project-id cb_p2 --sync-token token-${sessionId}`,
		expiresAt,
		cliMinVersion: "2.0.0",
	};
}

function renderStep(
	props: Partial<React.ComponentProps<typeof ScreenConnectPromptStep>> = {},
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(
			<ScreenConnectPromptStep
				projectName="repo-a"
				payload={null}
				isStarting={false}
				{...props}
			/>,
		);
	});
}

describe("FIX02 prompt credential follows the active session", () => {
	it("renders the new token after a session rotation", () => {
		const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
		renderStep({
			payload: payload("sess_new", future),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_new",
				status: "waiting_for_cli",
			},
		});
		expect(container?.textContent).toContain("token-sess_new");
		expect(container?.textContent).not.toContain("token-sess_old");
	});

	it("reports an expired session with a renewal action", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		renderStep({
			payload: payload("sess_old", past),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_old",
				status: "expired",
			},
			onRequestNewToken: () => {},
		});
		expect(container?.textContent).toContain("Sesi sinkronisasi berakhir");
		expect(container?.textContent).toContain("Buat prompt baru");
	});

	it("warns when the authoritative expiry is near while the prompt is shown", () => {
		const soon = new Date(Date.now() + 60_000).toISOString();
		renderStep({
			payload: payload("sess_soon", soon),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_soon",
				status: "waiting_for_cli",
				expiresAt: soon,
			},
			onRequestNewToken: () => {},
		});
		expect(container?.textContent).toContain("Sesi segera berakhir");
	});

	it("never hides a live prompt behind a stale credit lock", () => {
		const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
		renderStep({
			payload: payload("sess_live", future),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_live",
				status: "waiting_for_cli",
			},
			lockedPrompt: {
				variant: "insufficient",
				title: "Kredit tidak mencukupi",
				description: "Tambahkan kredit untuk melanjutkan.",
			},
			onRequestNewToken: () => {},
		});
		expect(
			container?.querySelector('[data-testid="locked-prompt-region"]'),
		).toBeNull();
		expect(container?.textContent).toContain("token-sess_live");
		expect(container?.textContent).not.toContain("Kredit tidak mencukupi");
	});

	it("still locks an expired prompt for a genuinely blocked account", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		renderStep({
			payload: payload("sess_dead", past),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_dead",
				status: "expired",
			},
			lockedPrompt: {
				variant: "insufficient",
				title: "Kredit tidak mencukupi",
				description: "Tambahkan kredit untuk melanjutkan.",
			},
			onRequestNewToken: () => {},
		});
		expect(
			container?.querySelector('[data-testid="locked-prompt-region"]'),
		).not.toBeNull();
		// An expired credential is never echoed back at the user.
		expect(container?.textContent).not.toContain("token-sess_dead");
	});

	it("copies the instructions of the active session only", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
		renderStep({
			payload: payload("sess_active", future),
			status: {
				projectId: "cb_p2",
				sessionId: "sess_active",
				status: "waiting_for_cli",
			},
			onRequestNewToken: () => {},
		});

		const copyButton = [...(container?.querySelectorAll("button") ?? [])].find(
			(button) => /^Salin/.test(button.textContent?.trim() ?? ""),
		);
		expect(copyButton).not.toBeUndefined();
		await act(async () => {
			copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(writeText).toHaveBeenCalledTimes(1);
		const copied = String(writeText.mock.calls[0]?.[0] ?? "");
		expect(copied).toContain("token-sess_active");
		expect(copied).toContain("repo-a");
		expect(copied).not.toContain("sess_old");
	});
});
