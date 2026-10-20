// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BantuanPage } from "@/routes/bantuan";

let sessionUser: { id: string; email: string; isAdmin: boolean } | null = null;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
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
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: sessionUser ? { user: sessionUser } : null }),
	},
}));

// isAdmin is the real implementation from @/lib/session; only the session it
// reads is controlled. Destinations are matched by href, not by visible copy.
function linkHrefs(): Array<string | null> {
	return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

afterEach(() => {
	cleanup();
	sessionUser = null;
});

describe("BantuanPage admin triage gate", () => {
	it("hides the staff triage route from a signed-in non-admin", () => {
		sessionUser = { id: "u1", email: "user@example.invalid", isAdmin: false };
		render(<BantuanPage />);

		expect(linkHrefs()).not.toContain("/admin/feedback");
	});

	it("hides the staff triage route from a signed-out visitor", () => {
		render(<BantuanPage />);

		expect(linkHrefs()).not.toContain("/admin/feedback");
	});

	it("shows the staff triage route to an admin", () => {
		sessionUser = { id: "u2", email: "admin@example.invalid", isAdmin: true };
		render(<BantuanPage />);

		expect(linkHrefs()).toContain("/admin/feedback");
	});

	it("keeps the feedback and home routes reachable for every visitor", () => {
		render(<BantuanPage />);

		const hrefs = linkHrefs();
		expect(hrefs).toContain("/settings/feedback");
		expect(hrefs).toContain("/");
	});
});

describe("BantuanPage Hub", () => {
	it("renders workflow guides, support channels, and a link to standalone FAQ", () => {
		sessionUser = { id: "u1", email: "user@example.invalid", isAdmin: false };
		render(<BantuanPage />);
		expect(screen.getByText("Pusat Bantuan")).toBeDefined();
		expect(screen.getByText(/Panduan Alur Kerja/i)).toBeDefined();
		expect(screen.getByText(/Feedback & Bug Report/i)).toBeDefined();
		expect(linkHrefs()).toContain("/faq");
		expect(linkHrefs()).toContain("/settings/billing");
	});

	it("does not embed FAQ accordion content or accordion toggle buttons", () => {
		sessionUser = { id: "u1", email: "user@example.invalid", isAdmin: false };
		render(<BantuanPage />);
		expect(
			screen.queryByRole("button", {
				name: /VibeScrape.*VibeDesign Studio/,
			}),
		).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: /Apa perbedaan VibePlan Greenfield/,
			}),
		).toBeNull();
	});

	it("renders workflow guides for VibePlan, VibeDesign, VibeScrape, and CLI", () => {
		sessionUser = { id: "u1", email: "user@example.invalid", isAdmin: false };
		render(<BantuanPage />);
		expect(screen.getByText("Alur Kerja VibePlan")).toBeDefined();
		expect(screen.getByText("Alur Kerja VibeDesign")).toBeDefined();
		expect(screen.getByText("Alur Kerja VibeScrape")).toBeDefined();
		expect(screen.getByText("Alur Kerja VibeEverything CLI")).toBeDefined();
	});
});
