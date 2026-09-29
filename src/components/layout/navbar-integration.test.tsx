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

vi.mock("@tanstack/react-router", () => ({
	useLocation: ({
		select,
	}: {
		select?: (l: { pathname: string }) => unknown;
	} = {}) =>
		select ? select({ pathname: mockPathname }) : { pathname: mockPathname },
	useMatches: () => [],
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
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
	ThemeToggle: () => null,
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
