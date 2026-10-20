// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsContentPanel } from "../components/settings/settings-content-panel";

// Mock router and functions for route components
vi.mock("@tanstack/react-router", () => ({
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
	createFileRoute: () => (config: { component: React.ComponentType }) => {
		const comp = config.component;
		return Object.assign(comp, {
			useLoaderData: () => ({
				profile: { fullName: "User Test", image: null, role: "developer" },
				email: "user@test.com",
				preferences: null,
			}),
		});
	},
	redirect: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({
			handler: (h: unknown) => h,
		}),
		handler: (h: unknown) => h,
	}),
}));

vi.mock("@/features/billing/services/payment.functions", () => ({
	cancelSubscription: vi.fn(),
}));

vi.mock("@/features/billing/services/billing-settings.functions", () => ({
	deletePayment: vi.fn(),
}));

vi.mock("@/features/billing/components/credit-usage", () => ({
	CreditUsageSection: () => <div data-testid="mock-credit-usage" />,
}));

import { BillingPage } from "@/features/billing/components/billing-page";

describe("Settings layout consistency across child pages", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders SettingsContentPanel with consistent container, border, padding, and heading tokens", () => {
		const { container } = render(
			<SettingsContentPanel
				title="Pengaturan Akun"
				description="Kelola akun dan email kamu."
				actions={<button type="button">Simpan</button>}
			>
				<div>Form body</div>
			</SettingsContentPanel>,
		);

		const panel = screen.getByTestId("settings-content-panel");
		expect(panel.className).toContain("max-w-4xl");
		expect(panel.className).toContain("rounded-xl");
		expect(panel.className).toContain("border");
		expect(panel.className).toContain("p-6");

		const heading = screen.getByRole("heading", { level: 2 });
		expect(heading.textContent).toBe("Pengaturan Akun");
		expect(heading.className).toContain("text-xl");
		expect(heading.className).toContain("font-bold");

		// Header divider line exists
		const headerSection = container.querySelector(".border-b");
		expect(headerSection).not.toBeNull();
	});

	it("guarantees consistent visual contract across all settings page representations", () => {
		const pages = [
			{ title: "Edit Profil", desc: undefined },
			{ title: "Pengaturan Akun", desc: undefined },
			{
				title: "API Keys",
				desc: "Kelola API key untuk MCP server dan CLI tool.",
			},
			{ title: "Preferensi Notifikasi", desc: undefined },
			{
				title: "Feedback & Bug Report",
				desc: "Bantu kami meningkatkan everythings-vibe.",
			},
		];

		for (const page of pages) {
			const { unmount } = render(
				<SettingsContentPanel title={page.title} description={page.desc}>
					<div>Content for {page.title}</div>
				</SettingsContentPanel>,
			);

			const heading = screen.getByRole("heading", { name: page.title });
			expect(heading).toBeDefined();

			const panel = screen.getByTestId("settings-content-panel");
			expect(panel.className).toContain("max-w-4xl");
			expect(panel.className).toContain("rounded-xl");

			unmount();
		}
	});

	it("guarantees BillingPage root container matches max-w-4xl boundary", () => {
		const { container } = render(
			<BillingPage
				subscription={undefined}
				payments={[]}
				creditUsage={{
					availableCredits: 10,
					reservedCredits: 0,
					totalCreditsUsed: 0,
					operations: [],
				}}
			/>,
		);

		const rootDiv = container.firstElementChild as HTMLElement;
		expect(rootDiv).not.toBeNull();
		expect(rootDiv.className).toContain("max-w-4xl");
		expect(rootDiv.className).toContain("w-full");
	});
});
