import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PlanCodebasePage } from "../components/workspace/plan-codebase-page";

export async function renderConnectedOnboarding() {
	const fetch = globalThis.fetch;
	vi.spyOn(window, "confirm").mockReturnValue(true);
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
					}),
				);
			}
			return fetch(input, init);
		}),
	);
	const rendered = render(<PlanCodebasePage />);
	await waitFor(() => {
		const start = screen.queryByRole("button", { name: "Mulai Sinkronisasi" });
		if (start) {
			fireEvent.click(start);
			return;
		}
		if (
			screen.queryByText("Sync codebase dengan everythings-vibe") ||
			screen.queryByTestId("codebase-sync-summary")
		)
			return;
		throw new Error("Onboarding is not ready");
	});
	return rendered;
}
