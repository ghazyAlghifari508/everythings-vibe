// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const sessionState = {
	data: null as null | {
		user: { name: string; image: string | null };
	},
};

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => sessionState,
	},
}));

function renderHeader(overrides: Record<string, unknown> = {}) {
	return render(
		<StudioHeader
			title="KopiKultur Coffee Shop App"
			duplicating={false}
			exporting={false}
			canExport
			onDuplicate={vi.fn()}
			onExport={vi.fn()}
			{...overrides}
		/>,
	);
}

function renderServerMarkup(): string {
	return renderToString(
		<StudioHeader
			title="KopiKultur Coffee Shop App"
			duplicating={false}
			exporting={false}
			canExport
			onDuplicate={() => {}}
			onExport={() => {}}
		/>,
	);
}

function hydrateMarkup(markup: string): { errors: unknown[][]; root: Root } {
	const errors: unknown[][] = [];
	const mismatch =
		/hydration failed|hydration mismatch|did not match|didn't match/i;
	const originalError = console.error;
	vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
		if (args.some((arg) => mismatch.test(String(arg)))) errors.push(args);
		else originalError(...args);
	});
	const container = document.createElement("div");
	container.innerHTML = markup;
	document.body.appendChild(container);
	let root!: Root;
	act(() => {
		root = hydrateRoot(
			container,
			<StudioHeader
				title="KopiKultur Coffee Shop App"
				duplicating={false}
				exporting={false}
				canExport
				onDuplicate={() => {}}
				onExport={() => {}}
			/>,
		);
	});
	return { errors, root };
}

describe("StudioHeader session hydration", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		sessionState.data = null;
		document.body.innerHTML = "";
	});

	it("renders a stable placeholder on the server even with a warm session cache", () => {
		// Session cache may already be warm on the client even when SSR saw
		// nothing; the server must still emit the placeholder because effects
		// never run during renderToString. Hydration then matches the first
		// client commit (hydrated === false) and the avatar lands via a
		// normal post-hydration update.
		sessionState.data = {
			user: { name: "Ava", image: "https://cdn.example/ava.png" },
		};
		const warmMarkup = renderServerMarkup();
		sessionState.data = null;
		const coldMarkup = renderServerMarkup();
		for (const markup of [warmMarkup, coldMarkup]) {
			expect(markup).not.toContain("cdn.example/ava.png");
		}
		const profileRegion = (markup: string) =>
			markup.slice(markup.indexOf("Profil dan tampilan"));
		expect(profileRegion(warmMarkup)).toBe(profileRegion(coldMarkup));
	});

	it("hydrates without mismatch, then shows the cached avatar", async () => {
		sessionState.data = null;
		const markup = renderServerMarkup();
		expect(markup).not.toContain("<img");

		sessionState.data = {
			user: { name: "Ava", image: "https://cdn.example/ava.png" },
		};
		const { errors, root } = hydrateMarkup(markup);
		expect(errors).toEqual([]);
		act(() => {
			root.render(
				<StudioHeader
					title="KopiKultur Coffee Shop App"
					duplicating={false}
					exporting={false}
					canExport
					onDuplicate={() => {}}
					onExport={() => {}}
				/>,
			);
		});
		const profileButton = document.body.querySelector(
			'button[aria-label="Profil dan tampilan"]',
		);
		expect(profileButton?.querySelector("img")?.src).toContain(
			"cdn.example/ava.png",
		);
		act(() => {
			root.unmount();
		});
		vi.restoreAllMocks();
	});

	it("shows the account name without an image, with an accessible dropdown", async () => {
		sessionState.data = { user: { name: "Ava", image: null } };
		renderHeader();
		act(() => {});
		const profileButton = screen.getByRole("button", {
			name: "Profil dan tampilan",
		});
		expect(profileButton.querySelector("img")).toBeNull();
		expect(profileButton.querySelector("svg")).not.toBeNull();
		fireEvent.pointerDown(profileButton, { button: 0, pointerType: "mouse" });
		expect(
			await screen.findByRole("menuitem", { name: /Pengaturan akun/i }),
		).toBeDefined();
	});
});
