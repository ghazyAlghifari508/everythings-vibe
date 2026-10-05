// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncPromptPayload } from "@/lib/codebase-sync";
import { ScreenConnect } from "./screen-connect";

const samplePayload: SyncPromptPayload = {
	projectId: "proj_gate_1",
	apiBaseUrl: "https://prdfy.example.com",
	syncToken: "tok_gate",
	cliMinVersion: "2.0.0",
	syncCommand: "vibeeverything codebase sync",
	expiresAt: new Date(Date.now() + 60000).toISOString(),
};

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
	vi.unstubAllGlobals();
});

function renderConnect(
	props: Partial<React.ComponentProps<typeof ScreenConnect>> = {},
) {
	act(() => {
		root?.render(
			<ScreenConnect
				projectName="Test App"
				payload={samplePayload}
				onAgentStarted={() => {}}
				{...props}
			/>,
		);
	});
	return container;
}

function nextButton(): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((b) =>
		/Lanjut ke Pantau Sync/i.test(b.textContent ?? ""),
	) as HTMLButtonElement | undefined;
}

function copyButton(): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((b) =>
		/^Salin$|Tersalin/i.test(b.textContent?.trim() ?? ""),
	) as HTMLButtonElement | undefined;
}

describe("ScreenConnect handshake gating", () => {
	it("keeps the Pantau Sync action disabled while the server waits for the CLI", () => {
		renderConnect({ canContinue: false });
		expect(nextButton()?.disabled).toBe(true);
	});

	it("enables the action once the server reports a real CLI handshake", () => {
		renderConnect({ canContinue: true });
		expect(nextButton()?.disabled).toBe(false);
	});

	it("never lets clicking Salin unlock the Pantau Sync action", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: { writeText },
		});
		renderConnect({ canContinue: false });

		await act(async () => {
			copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Copy feedback is honest UI feedback, not proof the agent executed.
		expect(container.textContent).toContain("Tersalin");
		expect(nextButton()?.disabled).toBe(true);
	});

	it("does not navigate on its own when the handshake arrives", () => {
		const onAgentStarted = vi.fn();
		// Re-render models the poller flipping canContinue from false to true
		// while the user is still looking at the prompt screen.
		renderConnect({ canContinue: false, onAgentStarted });
		act(() => {
			root?.render(
				<ScreenConnect
					projectName="Test App"
					payload={samplePayload}
					canContinue
					onAgentStarted={onAgentStarted}
				/>,
			);
		});
		expect(onAgentStarted).not.toHaveBeenCalled();
	});

	it("navigates only from an explicit click after the handshake", () => {
		const onAgentStarted = vi.fn();
		renderConnect({ canContinue: true, onAgentStarted });
		act(() => {
			nextButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onAgentStarted).toHaveBeenCalledTimes(1);
	});

	it("reports a waiting-for-CLI line, never a connected claim", () => {
		renderConnect({ canContinue: false });
		expect(container.textContent).toContain("Menunggu agent terhubung");
		expect(container.textContent).toContain(
			"Jalankan prompt dari root repository",
		);
		expect(container.textContent).not.toContain("Agent terhubung");
	});

	it("reports a detected repository only after the handshake", () => {
		renderConnect({ canContinue: true });
		expect(container.textContent).toContain("Agent terhubung");
		expect(container.textContent).toContain("Repository berhasil terdeteksi.");
	});

	it("never fabricates analysis progress on the prompt screen", () => {
		renderConnect({ canContinue: false });
		expect(container.textContent).not.toMatch(/menganalisis codebase/i);
		expect(container.textContent).not.toContain("%");
	});

	it("stays disabled without a payload even when a handshake is recorded", () => {
		renderConnect({ payload: null, canContinue: true });
		expect(nextButton()?.disabled).toBe(true);
	});
});
