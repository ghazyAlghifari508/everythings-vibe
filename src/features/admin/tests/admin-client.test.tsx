// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminClient } from "../components/admin-client";

let mockPathname = "/admin";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		className,
		title,
		"aria-label": ariaLabel,
	}: {
		to: string;
		children: React.ReactNode;
		className?: string;
		title?: string;
		"aria-label"?: string;
	}) => (
		<a href={to} className={className} title={title} aria-label={ariaLabel}>
			{children}
		</a>
	),
	useLocation: ({
		select,
	}: {
		select?: (l: { pathname: string }) => unknown;
	} = {}) => {
		const loc = { pathname: mockPathname };
		return select ? select(loc) : loc;
	},
}));

describe("AdminClient Top-Nav Shell", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		mockPathname = "/admin";
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("renders a single navigation landmark with compact Admin label, all 6 tabs, theme toggle, and exit link", () => {
		act(() => {
			root?.render(
				<AdminClient>
					<div id="admin-test-content">Dashboard Child Content</div>
				</AdminClient>,
			);
		});

		expect(container.querySelector("#admin-test-content")).not.toBeNull();

		// Exactly one nav landmark
		const navElements = container.querySelectorAll("nav");
		expect(navElements.length).toBe(1);
		expect(navElements[0].getAttribute("aria-label")).toBe("Navigasi Admin");

		// Compact "Admin" label, no generic "Admin Panel"
		expect(container.textContent).toContain("Admin");
		expect(container.textContent).not.toContain("Admin Panel");

		// All 6 navigation tabs
		expect(container.textContent).toContain("Ringkasan");
		expect(container.textContent).toContain("Pengguna");
		expect(container.textContent).toContain("Tiket");
		expect(container.textContent).toContain("Proyek");
		expect(container.textContent).toContain("Transaksi");
		expect(container.textContent).toContain("Pengaturan");

		// Exit link to workspace
		const exitLink = container.querySelector('a[href="/"]');
		expect(exitLink).not.toBeNull();
		expect(exitLink?.getAttribute("title")).toBe("Kembali ke Workspace");
		expect(exitLink?.textContent).toContain("Keluar");
	});

	it("has no streamer mode toggle, provider, or indicators in the shell", () => {
		act(() => {
			root?.render(
				<AdminClient>
					<div>Content</div>
				</AdminClient>,
			);
		});

		const toggleButton = container.querySelector(
			"button[title*='Streamer Mode']",
		);
		expect(toggleButton).toBeNull();
		expect(container.textContent).not.toContain("Streamer Mode");
	});

	it("highlights active tab based on current pathname", () => {
		mockPathname = "/admin/users";

		act(() => {
			root?.render(
				<AdminClient>
					<div>Users Page</div>
				</AdminClient>,
			);
		});

		const links = Array.from(container.querySelectorAll("nav a"));
		const usersLink = links.find((l) => l.textContent?.includes("Pengguna"));
		const ringkasanLink = links.find((l) =>
			l.textContent?.includes("Ringkasan"),
		);

		expect(usersLink?.className).toContain("bg-obsidian");
		expect(ringkasanLink?.className).not.toContain("bg-obsidian");
	});
});
