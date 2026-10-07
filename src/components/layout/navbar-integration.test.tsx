// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { Navbar } from "./navbar";
import { canShowNavbarTopUp } from "./navbar-topup-helper";

let mockPathname = "/prd/test-project-1";
let mockSearch: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
	useLocation: ({
		select,
	}: {
		select?: (l: {
			pathname: string;
			search: Record<string, unknown>;
		}) => unknown;
	} = {}) =>
		select
			? select({ pathname: mockPathname, search: mockSearch })
			: { pathname: mockPathname, search: mockSearch },
	useMatches: () => [],
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({
		children,
		to,
		className,
		onClick,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
		onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
	}) => (
		<a
			href={to}
			className={className}
			onClick={(e) => {
				e.preventDefault();
				onClick?.(e);
			}}
		>
			{children}
		</a>
	),
}));

const sessionState = vi.hoisted(() => ({
	user: { id: "user-1", email: "user@test.com" } as {
		id: string;
		email: string;
	} | null,
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: sessionState.user ? { user: sessionState.user } : null,
			isPending: false,
		}),
		signOut: vi.fn(async () => {}),
	},
}));

const mockPlanData: {
	plan: "free" | "pro" | "hengker";
	topUpEligible: boolean;
} = {
	plan: "free",
	topUpEligible: false,
};

vi.mock("@/hooks/use-user-plan", () => ({
	useUserPlan: () => ({
		data: mockPlanData,
	}),
}));

vi.mock("@/components/billing/top-up-modal", () => ({
	TopUpModal: () => null,
}));

vi.mock("@/components/ui/theme-toggle", () => ({
	ThemeToggle: () => (
		<button type="button" aria-label="Toggle dark mode">
			Theme
		</button>
	),
}));

let queryClient: QueryClient;

/**
 * Production mounts the Navbar inside `Providers`, which owns the
 * QueryClientProvider. The render helper reproduces that so `useQueryClient`
 * resolves exactly as it does in the running app.
 */
function renderNavbar() {
	return render(
		<QueryClientProvider client={queryClient}>
			<Navbar onOpenDrawer={() => {}} />
		</QueryClientProvider>,
	);
}

function openUserMenu() {
	fireEvent.click(screen.getByRole("button", { name: "User menu" }));
}

beforeEach(() => {
	mockPathname = "/prd/test-project-1";
	mockSearch = {};
	mockPlanData.plan = "free";
	mockPlanData.topUpEligible = false;
	sessionState.user = { id: "user-1", email: "user@test.com" };
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	useUIStore.getState().closePaywallModal();
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	vi.restoreAllMocks();
});

describe("Navbar TopUp Integration Contract", () => {
	it("correctly identifies when to mount Top Up button in navbar", () => {
		expect(
			canShowNavbarTopUp({
				user: { id: "u1" },
				plan: "pro",
				topUpEligible: true,
			}),
		).toBe(true);
		expect(
			canShowNavbarTopUp({
				user: { id: "u1" },
				plan: "free",
				topUpEligible: false,
			}),
		).toBe(false);
	});

	it("integrates TopUpModal and top-up trigger button in navbar source", async () => {
		const source = await readFile(
			`${process.cwd()}/src/components/layout/navbar.tsx`,
			"utf8",
		);
		expect(source).toContain("TopUpModal");
		expect(source).toContain("canShowNavbarTopUp");
		expect(source).toContain("isTopUpOpen");
	});
});

describe("Navbar Paywall Integration Contract", () => {
	it("triggers openPaywallModal('ac') when free user clicks Upgrade on PRD step", () => {
		mockPathname = "/prd/test-project-1";
		renderNavbar();

		const upgradeButton = screen.getByRole("button", {
			name: /Upgrade ke Pro/i,
		});
		expect(upgradeButton).toBeDefined();

		fireEvent.click(upgradeButton);

		expect(useUIStore.getState().isPaywallOpen).toBe(true);
		expect(useUIStore.getState().paywallStage).toBe("ac");
	});

	it("integrates paywall modal trigger button with Lock icon in navbar source", async () => {
		const source = await readFile(
			`${process.cwd()}/src/components/layout/navbar.tsx`,
			"utf8",
		);
		expect(source).toContain('openPaywallModal("ac")');
		expect(source).toContain("<Lock");
		expect(source).toContain("text-amber-400");
	});
});
describe("Navbar Fitur Generate PRD Contract", () => {
	it("renders Generate PRD action on the fitur step", () => {
		mockPathname = "/fitur/test-project-1";
		renderNavbar();
		const cta = screen.getByRole("button", { name: /Generate PRD/i });
		expect(cta).toBeDefined();
		expect(cta.hasAttribute("disabled")).toBe(false);
	});

	it("shows no Task, Kanban, or document drawer trigger on the fitur step", () => {
		mockPathname = "/fitur/test-project-1";
		renderNavbar();
		expect(screen.queryByRole("button", { name: /Kanban/i })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Menu dokumen proyek/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: /^Task$/i })).toBeNull();
	});

	it("wires the fitur CTA through savePendingPrdPrompt into /prd/$id source", async () => {
		const source = await readFile(
			`${process.cwd()}/src/components/layout/navbar.tsx`,
			"utf8",
		);
		expect(source).toContain('routeStep === "fitur"');
		expect(source).toContain("savePendingPrdPrompt");
		expect(source).toContain('to: "/prd/$id"');
	});
});

describe("Navbar Rebranding & Layout", () => {
	it("renders VibeEverything logo and only Pricing navlink", () => {
		mockPathname = "/";
		renderNavbar();
		expect(screen.getByText("VibeEverything")).toBeDefined();
		expect(screen.getByRole("link", { name: /Pricing/i })).toBeDefined();
		expect(screen.queryByRole("link", { name: /Home/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /FAQ/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /History/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /VibePlan/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /VibeDesign/i })).toBeNull();
	});

	it("renders hamburger menu button for history drawer on home", () => {
		mockPathname = "/";
		renderNavbar();
		const hamburger = screen.getByRole("button", { name: /^Riwayat$/i });
		expect(hamburger).toBeDefined();
	});
});

describe("Navbar session boundary", () => {
	// A signed-out visitor can never load history, so the trigger must not be
	// offered: it would only lead to an error panel with a dead "Coba lagi".
	it("hides the history trigger when there is no session", () => {
		sessionState.user = null;
		mockPathname = "/";

		renderNavbar();

		expect(screen.queryByRole("button", { name: /^Riwayat$/i })).toBeNull();
	});

	it("offers the history trigger once a session exists on home", () => {
		mockPathname = "/";
		renderNavbar();
		expect(screen.getByRole("button", { name: /^Riwayat$/i })).toBeDefined();
	});

	it("hides the history trigger on workspace routes even when session exists", () => {
		mockPathname = "/prd/test-project-1";
		renderNavbar();
		expect(screen.queryByRole("button", { name: /^Riwayat$/i })).toBeNull();
	});

	// The blocker: the QueryClient is created once per router instance and
	// survives client-side navigation, so without an explicit clear() the next
	// signed-in user can read the previous user's cached rows.
	it("clears the user-scoped query cache on logout", async () => {
		// The user dropdown only exists outside the workspace step routes.
		mockPathname = "/";
		queryClient.setQueryData(["drawer-history", "user-1"], {
			items: [{ name: "Proyek Milik User Satu" }],
		});
		queryClient.setQueryData(["user-plan", "user-1"], { plan: "pro" });
		expect(
			queryClient.getQueryData(["drawer-history", "user-1"]),
		).not.toBeUndefined();

		renderNavbar();
		openUserMenu();
		fireEvent.click(screen.getByRole("button", { name: /Log Out/i }));

		await waitFor(() => {
			expect(
				queryClient.getQueryData(["drawer-history", "user-1"]),
			).toBeUndefined();
		});
		// The whole user-scoped cache goes, not just one hand-picked key.
		expect(queryClient.getQueryData(["user-plan", "user-1"])).toBeUndefined();
	});
});

describe("Navbar Greenfield Workspace Navlinks", () => {
	it("renders Chat and Riwayat on /plan/new without Pricing link in desktop and mobile", () => {
		mockPathname = "/plan/new";
		renderNavbar();

		// Desktop navlinks
		expect(screen.getByRole("link", { name: /^Chat$/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /^Riwayat$/i })).toBeDefined();
		expect(screen.queryByRole("link", { name: /^Pricing$/i })).toBeNull();

		// Open mobile menu
		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		// Mobile menu renders Chat and Riwayat; zero Pricing or duplicate History
		const allChatLinks = screen.getAllByRole("link", { name: /^Chat$/i });
		const allRiwayatLinks = screen.getAllByRole("link", { name: /^Riwayat$/i });
		expect(allChatLinks).toHaveLength(2); // 1 desktop + 1 mobile
		expect(allRiwayatLinks).toHaveLength(2); // 1 desktop + 1 mobile
		expect(screen.queryByRole("link", { name: /^Pricing$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /^History$/i })).toBeNull();
	});

	it("renders Chat and Riwayat on /history?workspace=greenfield without Pricing", () => {
		mockPathname = "/history";
		mockSearch = { workspace: "greenfield" };
		renderNavbar();

		// Desktop navlinks
		expect(screen.getByRole("link", { name: /^Chat$/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /^Riwayat$/i })).toBeDefined();
		expect(screen.queryByRole("link", { name: /^Pricing$/i })).toBeNull();

		// Open mobile menu
		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		expect(screen.getAllByRole("link", { name: /^Chat$/i })).toHaveLength(2);
		expect(screen.getAllByRole("link", { name: /^Riwayat$/i })).toHaveLength(2);
		expect(screen.queryByRole("link", { name: /^Pricing$/i })).toBeNull();
	});

	it("renders Pricing on home route / and does not render Chat", () => {
		mockPathname = "/";
		renderNavbar();

		// Desktop navlinks
		expect(screen.getByRole("link", { name: /^Pricing$/i })).toBeDefined();
		expect(screen.queryByRole("link", { name: /^Chat$/i })).toBeNull();

		// Open mobile menu
		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		expect(screen.getAllByRole("link", { name: /^Pricing$/i })).toHaveLength(2);
		expect(screen.queryByRole("link", { name: /^Chat$/i })).toBeNull();
	});

	it("offers the saved-project library on the codebase sync wizard route", () => {
		mockPathname = "/plan/codebase";
		mockSearch = {};
		renderNavbar();

		const libraryLink = screen.getByRole("link", {
			name: /Project Tersimpan/i,
		});
		expect(libraryLink.getAttribute("href")).toBe("/codebases");
	});

	it("keeps the global nav clean on the saved-project library route", () => {
		mockPathname = "/codebases";
		mockSearch = {};
		renderNavbar();

		// The library is reached from VibePlan, so the global nav stays as-is
		// instead of duplicating a workspace-specific nav everywhere.
		expect(screen.getByRole("link", { name: /^Pricing$/i })).toBeDefined();
		expect(
			screen.queryByRole("link", { name: /Project Tersimpan/i }),
		).toBeNull();
	});

	it("renders CodebaseStepNav on /plan/codebase route", () => {
		mockPathname = "/plan/codebase";
		mockSearch = {};
		useUIStore.getState().setCodebasePlanStep("sync");
		renderNavbar();

		const steppers = screen.getAllByRole("list", {
			name: /Tahapan sinkronisasi codebase/i,
		});
		expect(steppers.length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByRole("link", { name: /^Pricing$/i })).toBeNull();
	});

	it("hides theme toggle, user profile menu, and mobile hamburger on /plan/codebase route", () => {
		mockPathname = "/plan/codebase";
		mockSearch = {};
		sessionState.user = { id: "user-1", email: "user@test.com" };
		renderNavbar();

		expect(
			screen.queryByRole("button", { name: /Toggle dark mode/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "User menu" })).toBeNull();
		expect(screen.queryByRole("link", { name: /Log In/i })).toBeNull();
		expect(screen.queryByRole("button", { name: /Toggle menu/i })).toBeNull();
	});

	it("renders Top Up button on /plan/codebase route only when user is eligible", () => {
		mockPathname = "/plan/codebase";
		mockSearch = {};
		sessionState.user = { id: "user-1", email: "user@test.com" };
		mockPlanData.plan = "pro";
		mockPlanData.topUpEligible = true;

		renderNavbar();

		expect(
			screen.getByRole("button", { name: /Isi ulang kredit/i }),
		).toBeDefined();

		// Still no theme toggle or profile menu
		expect(
			screen.queryByRole("button", { name: /Toggle dark mode/i }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "User menu" })).toBeNull();
	});

	it("hides Top Up button on /plan/codebase route when user is not eligible", () => {
		mockPathname = "/plan/codebase";
		mockSearch = {};
		sessionState.user = { id: "user-1", email: "user@test.com" };
		mockPlanData.plan = "free";
		mockPlanData.topUpEligible = false;

		renderNavbar();

		expect(
			screen.queryByRole("button", { name: /Isi ulang kredit/i }),
		).toBeNull();
	});

	it("renders theme toggle and user menu on standard home route", () => {
		mockPathname = "/";
		sessionState.user = { id: "user-1", email: "user@test.com" };
		renderNavbar();

		expect(
			screen.getByRole("button", { name: /Toggle dark mode/i }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "User menu" })).toBeDefined();
	});
});

describe("Navbar VibeDesign Scrap Workspace Navlinks", () => {
	it("renders Scrap, History, and Pricing on /design/scrap with Scrap active", () => {
		mockPathname = "/design/scrap";
		renderNavbar();

		// Desktop navlinks
		const scrapLink = screen.getByRole("link", { name: /^Scrap$/i });
		const historyLink = screen.getByRole("link", { name: /^History$/i });
		const pricingLink = screen.getByRole("link", { name: /^Pricing$/i });

		expect(scrapLink).toBeDefined();
		expect(historyLink).toBeDefined();
		expect(pricingLink).toBeDefined();

		// Scrap active state: has bg-white/10; History does not
		expect(scrapLink.className).toContain("bg-white/10");
		expect(historyLink.className).not.toContain("bg-white/10");
		expect(pricingLink.className).not.toContain("bg-white/10");

		// Open mobile menu
		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		const allScrapLinks = screen.getAllByRole("link", { name: /^Scrap$/i });
		const allHistoryLinks = screen.getAllByRole("link", { name: /^History$/i });
		const allPricingLinks = screen.getAllByRole("link", { name: /^Pricing$/i });

		expect(allScrapLinks).toHaveLength(2); // 1 desktop + 1 mobile
		expect(allHistoryLinks).toHaveLength(2); // 1 desktop + 1 mobile
		expect(allPricingLinks).toHaveLength(2); // 1 desktop + 1 mobile

		// Mobile history link points to /design/scrap/history, NOT generic /history
		expect(allHistoryLinks[1].getAttribute("href")).toBe(
			"/design/scrap/history",
		);
		expect(screen.queryByRole("link", { name: /^Riwayat$/i })).toBeNull();
		// Mobile drawer on VibeDesign routes must NOT include FAQ or Settings
		expect(screen.queryByRole("link", { name: /^FAQ$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /^Settings$/i })).toBeNull();
	});

	it("renders Scrap, History, and Pricing on /design/scrap/history with History active and Scrap inactive", () => {
		mockPathname = "/design/scrap/history";
		renderNavbar();

		const scrapLink = screen.getByRole("link", { name: /^Scrap$/i });
		const historyLink = screen.getByRole("link", { name: /^History$/i });
		const pricingLink = screen.getByRole("link", { name: /^Pricing$/i });

		// History is active; Scrap is NOT active
		expect(historyLink.className).toContain("bg-white/10");
		expect(scrapLink.className).not.toContain("bg-white/10");
		expect(pricingLink.className).not.toContain("bg-white/10");
	});

	it("keeps Scrap context active on /design/scrap/$id result/processing subroute", () => {
		mockPathname = "/design/scrap/job-xyz-123";
		renderNavbar();

		const scrapLink = screen.getByRole("link", { name: /^Scrap$/i });
		const historyLink = screen.getByRole("link", { name: /^History$/i });

		expect(scrapLink.className).toContain("bg-white/10");
		expect(historyLink.className).not.toContain("bg-white/10");
	});

	it("exclusively scopes mobile drawer on VibeDesign routes to Home, Scrap, History, Pricing and closes on click", () => {
		mockPathname = "/design/scrap/history";
		renderNavbar();

		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		const homeLink = screen.getByRole("link", { name: /^Home$/i });
		const allScrapLinks = screen.getAllByRole("link", { name: /^Scrap$/i });
		const allHistoryLinks = screen.getAllByRole("link", { name: /^History$/i });
		const allPricingLinks = screen.getAllByRole("link", { name: /^Pricing$/i });

		expect(homeLink).toBeDefined();
		expect(allScrapLinks).toHaveLength(2);
		expect(allHistoryLinks).toHaveLength(2);
		expect(allPricingLinks).toHaveLength(2);

		expect(screen.queryByRole("link", { name: /^FAQ$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /^Settings$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /^Riwayat$/i })).toBeNull();

		expect(allHistoryLinks[1].className).toContain("bg-white/10");
		expect(allScrapLinks[1].className).not.toContain("bg-white/10");

		fireEvent.click(allScrapLinks[1]);
		expect(screen.queryAllByRole("link", { name: /^Scrap$/i })).toHaveLength(1);
	});

	it("does not show VibeDesign navlinks on unrelated routes and renders FAQ/Settings in mobile menu", () => {
		mockPathname = "/";
		renderNavbar();

		expect(screen.queryByRole("link", { name: /^Scrap$/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /^History$/i })).toBeNull();
		expect(screen.getByRole("link", { name: /^Pricing$/i })).toBeDefined();

		const toggleBtn = screen.getByRole("button", { name: /Toggle menu/i });
		fireEvent.click(toggleBtn);

		expect(screen.getByRole("link", { name: /^FAQ$/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /^Settings$/i })).toBeDefined();
	});
});
