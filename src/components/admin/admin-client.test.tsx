// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminClient } from "./admin-client";

let mockPathname = "/admin";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		className,
	}: {
		to: string;
		children: React.ReactNode;
		className?: string;
	}) => (
		<a href={to} className={className}>
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
		localStorage.clear();
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

	it("renders the top-nav header tabs, brand, and children", () => {
		act(() => {
			root?.render(
				<AdminClient>
					<div id="admin-test-content">Dashboard Child Content</div>
				</AdminClient>,
			);
		});

		expect(container.querySelector("#admin-test-content")).not.toBeNull();
		expect(container.textContent).toContain("Admin Panel");
		expect(container.textContent).toContain("Ringkasan");
		expect(container.textContent).toContain("Pengguna");
		expect(container.textContent).toContain("Tiket");
		expect(container.textContent).toContain("Proyek");
		expect(container.textContent).toContain("Transaksi");
		expect(container.textContent).toContain("Pengaturan");
	});

	it("toggles streamer mode when clicking the toggle button", () => {
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
		expect(toggleButton).not.toBeNull();
		expect(toggleButton?.textContent).toContain("OFF");

		act(() => {
			toggleButton?.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true }),
			);
		});

		expect(toggleButton?.textContent).toContain("ON");
		expect(localStorage.getItem("prdfy_admin_streamer_mode")).toBe("true");

		act(() => {
			toggleButton?.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true }),
			);
		});

		expect(toggleButton?.textContent).toContain("OFF");
		expect(localStorage.getItem("prdfy_admin_streamer_mode")).toBe("false");
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
