import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PlanCodebasePage } from "../components/workspace/plan-codebase-page";
import type { PlanCodebaseIntent } from "../services/onboarding-intent";

/**
 * Renders the onboarding page and waits until it has settled into a real
 * screen. A startable account no longer waits for a "Siapkan instruksi" click,
 * so readiness is the live prompt (the copy action only exists once a session
 * payload has landed) or an error card.
 *
 * `intent` mirrors the route search param, so a test can exercise the explicit
 * fresh-start intent the same way the URL does.
 */
export async function renderConnectedOnboarding(options?: {
	intent?: PlanCodebaseIntent;
}) {
	const fetch = globalThis.fetch;
	vi.stubGlobal(
		"fetch",
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input) === "/api/codebases?preflight=analysis") {
				return Promise.resolve(
					Response.json({
						code: "FREE_ALLOWANCE_AVAILABLE",
						availableCredits: 2,
						maximumCredits: 0,
						pricingVersion: "adaptive-v1",
						canStart: true,
						requiresApproval: false,
					}),
				);
			}
			return fetch(input, init);
		}),
	);
	const rendered = render(<PlanCodebasePage intent={options?.intent} />);
	await waitFor(() => {
		if (screen.queryByRole("button", { name: "Salin prompt untuk AI agent" }))
			return;
		if (screen.queryByRole("alert")) return;
		if (
			screen.queryByRole("button", {
				name: /Buat prompt baru|Buat sesi baru|Dapatkan token baru|Perbarui sesi/,
			})
		)
			return;
		// A recovered attempt that already uploaded has no credential to restore,
		// so its prompt row settles into the transport-done state instead.
		if (document.querySelector('[data-testid="prompt-transport-done"]')) return;
		if (document.querySelector('[data-testid="codebase-sync-summary"]')) return;
		throw new Error("Onboarding is not ready");
	});
	return rendered;
}
