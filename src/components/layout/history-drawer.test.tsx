// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryDrawer, toDrawerItems } from "./history-drawer";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateSpy,
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

const loadHistorySpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/history", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/history")>();
	return { ...actual, loadHistory: loadHistorySpy };
});

/** The session the drawer scopes its cache key to. Mirrors the userPlan hook. */
const sessionState = vi.hoisted(() => ({ userId: "user-1" as string | null }));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: sessionState.userId ? { user: { id: sessionState.userId } } : null,
			isPending: false,
		}),
	},
}));

const SIMRS_ID = "11111111-1111-4111-8111-111111111111";
const AIRBNB_ID = "22222222-2222-4222-8222-222222222222";

const mockItems = [
	{
		id: SIMRS_ID,
		name: "E-Commerce SIMRS",
		type: "plan" as const,
		updatedAt: new Date("2026-09-28T04:00:00.000Z"),
		url: `/prd/${SIMRS_ID}`,
		step: "prd",
		preview: "Ringkasan produk yang sudah digenerate AI.",
		acStatus: null,
		taskStatus: null,
	},
	{
		id: AIRBNB_ID,
		name: "Airbnb Landing Scrap",
		type: "scrap" as const,
		updatedAt: new Date("2026-09-20T04:00:00.000Z"),
		url: `/prd/${AIRBNB_ID}`,
		step: "task",
		preview: null,
		acStatus: "completed",
		taskStatus: "completed",
	},
];

/** Wire shape the real server fn returns, unlike `mockItems` above. */
const wireItems = [
	{
		id: SIMRS_ID,
		name: "Proyek Milik User Satu",
		step: "prd",
		lastUrl: `/prd/${SIMRS_ID}`,
		updatedAt: "2026-09-28T04:00:00.000Z",
		preview: "Ringkasan AI milik user pertama.",
		acStatus: null,
		taskStatus: null,
	},
	{
		id: AIRBNB_ID,
		name: "Proyek Milik User Dua",
		step: "ac",
		lastUrl: `/ac/${AIRBNB_ID}`,
		updatedAt: "2026-09-20T04:00:00.000Z",
		preview: null,
		acStatus: "completed",
		taskStatus: null,
	},
];

let queryClient: QueryClient;

function renderOpenDrawer() {
	return render(
		<QueryClientProvider client={queryClient}>
			<HistoryDrawer isOpen onClose={() => {}} />
		</QueryClientProvider>,
	);
}

function renderDrawer(props: Partial<React.ComponentProps<typeof HistoryDrawer>>) {
	return render(
		<QueryClientProvider client={queryClient}>
			<HistoryDrawer
				isOpen
				onClose={() => {}}
				override={{ items: mockItems }}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

function filterPills() {
	return within(
		screen.getByRole("group", { name: "Filter kategori riwayat" }),
	);
}

beforeEach(() => {
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	loadHistorySpy.mockReset();
	navigateSpy.mockReset();
	sessionState.userId = "user-1";
});

afterEach(() => {
	cleanup();
	queryClient.clear();
});

describe("HistoryDrawer rendering", () => {
	it("renders the search input, all four category pills, and every item", () => {
		renderDrawer({});

		expect(
			screen.getByPlaceholderText("Cari riwayat, nama projek, atau desain..."),
		).toBeDefined();

		for (const label of ["Semua", "VibePlan", "VibeDesign", "Scrap"]) {
			expect(filterPills().getByText(label)).toBeDefined();
		}

		expect(screen.getByText("E-Commerce SIMRS")).toBeDefined();
		expect(screen.getByText("Airbnb Landing Scrap")).toBeDefined();
	});

	it("exposes the drawer as a labelled dialog with an accessible close control", () => {
		renderDrawer({});

		expect(screen.getByRole("dialog", { name: "Riwayat Projek" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Tutup riwayat" })).toBeDefined();
	});

	it("marks the active category pill as pressed and switches it on click", () => {
		renderDrawer({});

		const all = filterPills().getByRole("button", { name: "Semua" });
		const plan = filterPills().getByRole("button", { name: "VibePlan" });
		expect(all.getAttribute("aria-pressed")).toBe("true");
		expect(plan.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(plan);

		expect(plan.getAttribute("aria-pressed")).toBe("true");
		expect(all.getAttribute("aria-pressed")).toBe("false");
	});
});

describe("HistoryDrawer filtering", () => {
	it("narrows the list from the search input", () => {
		renderDrawer({});

		fireEvent.change(
			screen.getByPlaceholderText("Cari riwayat, nama projek, atau desain..."),
			{ target: { value: "SIMRS" } },
		);

		expect(screen.getByText("E-Commerce SIMRS")).toBeDefined();
		expect(screen.queryByText("Airbnb Landing Scrap")).toBeNull();
	});

	it("narrows the list from a category pill", () => {
		renderDrawer({});

		fireEvent.click(filterPills().getByRole("button", { name: "VibePlan" }));

		expect(screen.getByText("E-Commerce SIMRS")).toBeDefined();
		expect(screen.queryByText("Airbnb Landing Scrap")).toBeNull();
	});
});

describe("HistoryDrawer lazy fetching", () => {
	it("does not query history while closed and queries once opened", async () => {
		loadHistorySpy.mockResolvedValue({ items: [] });

		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<HistoryDrawer isOpen={false} onClose={() => {}} />
			</QueryClientProvider>,
		);

		await Promise.resolve();
		expect(loadHistorySpy).not.toHaveBeenCalled();

		rerender(
			<QueryClientProvider client={queryClient}>
				<HistoryDrawer isOpen onClose={() => {}} />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(loadHistorySpy).toHaveBeenCalledTimes(1);
		});
	});
});

describe("HistoryDrawer empty states", () => {
	it("explains an empty history instead of rendering a blank panel", () => {
		renderDrawer({ override: { items: [] } });

		expect(screen.getByText(/Belum ada riwayat projek/i)).toBeDefined();
	});

	// Phase 1 has no design/scrap tables, so the real query only ever yields
	// plan rows. These pills must therefore report an honest empty result
	// rather than a spinner or an invented row.
	const phaseOneItems = [mockItems[0]];

	it("reports an honest empty state for the VibeDesign category", () => {
		renderDrawer({ override: { items: phaseOneItems } });

		fireEvent.click(filterPills().getByRole("button", { name: "VibeDesign" }));

		expect(screen.getByText("Belum ada desain tersimpan.")).toBeDefined();
	});

	it("reports an honest empty state for the Scrap category", () => {
		renderDrawer({ override: { items: phaseOneItems } });

		fireEvent.click(filterPills().getByRole("button", { name: "Scrap" }));

		expect(screen.getByText("Belum ada hasil scrap.")).toBeDefined();
	});
});

describe("HistoryDrawer global side effects", () => {
	// Regression: the drawer is mounted on every route by AppLayout. When its
	// Radix parts are force-mounted, RemoveScrollBar never unmounts (so
	// body[data-scroll-locked] + an `overflow: hidden !important` stylesheet
	// stick for the whole session) and hideOthers() never cleans up (so every
	// element outside the drawer stays aria-hidden from assistive tech). A
	// closed drawer must have zero global footprint.
	const renderWithAppRoot = (isOpen: boolean) =>
		render(
			<QueryClientProvider client={queryClient}>
				<div data-testid="app-root">
					<HistoryDrawer isOpen={isOpen} onClose={() => {}} />
				</div>
			</QueryClientProvider>,
		);

	it("leaves no scroll lock on the body while closed", () => {
		renderWithAppRoot(false);

		expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
	});

	it("leaves the rest of the app visible to assistive tech while closed", () => {
		const { container } = renderWithAppRoot(false);

		// `container` is the app's own mount element, the direct <body> child
		// that hideOthers() shields once the drawer is open. It is the real-app
		// analogue of the #root div, so it is where the regression shows.
		expect(container.getAttribute("aria-hidden")).not.toBe("true");
	});

	it("does not paint a closed drawer panel (no initial slide-out flash)", () => {
		const { container } = renderWithAppRoot(false);

		expect(container.querySelector(".drawer-content")).toBeNull();
		expect(document.querySelector(".drawer-content")).toBeNull();
	});

	it("releases the scroll lock and the aria-hidden shield after open then close", async () => {
		loadHistorySpy.mockResolvedValue({ items: [] });
		const { container, rerender } = renderWithAppRoot(false);

		rerender(
			<QueryClientProvider client={queryClient}>
				<div data-testid="app-root">
					<HistoryDrawer isOpen onClose={() => {}} />
				</div>
			</QueryClientProvider>,
		);
		await screen.findByRole("dialog", { name: "Riwayat Projek" });

		// Sanity: while open the shield is legitimately applied, otherwise the
		// assertions after close would pass for the wrong reason.
		expect(container.getAttribute("aria-hidden")).toBe("true");

		rerender(
			<QueryClientProvider client={queryClient}>
				<div data-testid="app-root">
					<HistoryDrawer isOpen={false} onClose={() => {}} />
				</div>
			</QueryClientProvider>,
		);
		await waitFor(() => {
			expect(document.querySelector(".drawer-content")).toBeNull();
		});

		expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
		expect(container.getAttribute("aria-hidden")).not.toBe("true");
	});
});

describe("HistoryDrawer query failure", () => {
	// The failure fixture is a transport/server error, because that is the only
	// class a retry can actually fix. An auth failure gets its own cases below.
	it("reports the failure and retries instead of claiming there is no history", async () => {
		loadHistorySpy.mockRejectedValue(new Error("Failed to fetch"));

		renderOpenDrawer();

		const retry = await screen.findByRole("button", { name: /Coba lagi/i });
		expect(retry).toBeDefined();
		// The fabricated empty state must not stand in for a failed load.
		expect(screen.queryByText(/Belum ada riwayat projek/i)).toBeNull();
		expect(loadHistorySpy).toHaveBeenCalledTimes(1);

		loadHistorySpy.mockResolvedValue({ items: [] });
		fireEvent.click(retry);

		await waitFor(() => {
			expect(loadHistorySpy).toHaveBeenCalledTimes(2);
		});
		await screen.findByText(/Belum ada riwayat projek/i);
	});

	it("does not blame the connection when the session is gone", async () => {
		loadHistorySpy.mockRejectedValue(new Error("Unauthorized"));

		renderOpenDrawer();

		const signIn = await screen.findByRole("link", { name: /Masuk/i });
		expect(signIn.getAttribute("href")).toBe("/login");
		expect(screen.queryByText(/Periksa koneksi/i)).toBeNull();
		// A retry can never succeed once the session is gone.
		expect(screen.queryByRole("button", { name: /Coba lagi/i })).toBeNull();
	});

	it("does not offer a retry when the account is blocked", async () => {
		loadHistorySpy.mockRejectedValue(new Error("Forbidden"));

		renderOpenDrawer();

		await screen.findByText(/diblokir/i);
		expect(screen.queryByRole("button", { name: /Coba lagi/i })).toBeNull();
	});

	// The three contradictory statements F6 reported: an error panel drawn over
	// a loaded list, a "—" item badge, and a footer still reporting the real count.
	it("keeps the loaded list when a background refetch fails afterwards", async () => {
		loadHistorySpy.mockResolvedValue({ items: wireItems });
		renderOpenDrawer();
		await screen.findByText("Proyek Milik User Satu");

		loadHistorySpy.mockRejectedValue(new Error("Failed to fetch"));
		await act(async () => {
			await queryClient.refetchQueries();
		});

		// The notice lands with the observer notification that follows the
		// refetch, so wait for it rather than assuming a synchronous re-render.
		await screen.findByText(/data tersimpan/i);
		expect(screen.getByText("Proyek Milik User Satu")).toBeDefined();
		expect(screen.getByText("2 Item")).toBeDefined();
		expect(screen.getByText("2 ditampilkan")).toBeDefined();
		expect(screen.queryByRole("button", { name: /Coba lagi/i })).toBeNull();
		// The loaded rows must not be replaced by the failure panel.
		expect(screen.queryByText(/Gagal memuat riwayat/i)).toBeNull();
	});

	it("does not report a row count while the very first load has failed", async () => {
		loadHistorySpy.mockRejectedValue(new Error("Failed to fetch"));
		renderOpenDrawer();

		await screen.findByRole("button", { name: /Coba lagi/i });

		expect(screen.queryByText(/0 ditampilkan/i)).toBeNull();
		expect(screen.getByText("—")).toBeDefined();
	});
});

describe("HistoryDrawer session scoping", () => {
	// The query cache outlives signOut, so a global key would let the next
	// signed-in user read the previous user's cached rows.
	it("keeps each session's history under its own cache key", async () => {
		loadHistorySpy.mockResolvedValue({ items: wireItems });

		const { rerender } = renderOpenDrawer();
		await screen.findByText("Proyek Milik User Satu");

		expect(
			queryClient.getQueryData(["drawer-history", "user-1"]),
		).not.toBeUndefined();

		sessionState.userId = "user-2";
		loadHistorySpy.mockResolvedValue({
			items: [
				{
					...wireItems[0],
					id: "33333333-3333-4333-8333-333333333333",
					name: "Proyek Milik User Dua",
				},
			],
		});
		rerender(
			<QueryClientProvider client={queryClient}>
				<HistoryDrawer isOpen onClose={() => {}} />
			</QueryClientProvider>,
		);

		await screen.findByText("Proyek Milik User Dua");
		expect(screen.queryByText("Proyek Milik User Satu")).toBeNull();
		expect(
			queryClient.getQueryData(["drawer-history", "user-2"]),
		).not.toBeUndefined();
	});
});

describe("HistoryDrawer item navigation", () => {
	it("navigates a parsed project route through the router", async () => {
		renderDrawer({ override: { items: [mockItems[0]] } });

		fireEvent.click(screen.getByText("E-Commerce SIMRS"));

		expect(navigateSpy).toHaveBeenCalledWith({
			to: "/prd/$id",
			params: { id: SIMRS_ID },
		});
	});

	// F8: the allowlist permits lastUrl = "/codebases", but parseHistoryHref
	// returned null for it, so the drawer closed and did nothing at all.
	it("navigates the codebase list instead of silently doing nothing", () => {
		renderDrawer({
			override: {
				items: [{ ...mockItems[0], url: "/codebases", name: "Basis Kode" }],
			},
		});

		fireEvent.click(screen.getByText("Basis Kode"));

		expect(navigateSpy).toHaveBeenCalledWith({ to: "/codebases" });
	});
});

describe("HistoryDrawer status line", () => {
	it("does not claim a generated project is still waiting for its PRD", () => {
		renderDrawer({
			override: {
				items: [
					{
						...mockItems[0],
						step: "prd",
						preview: "Ringkasan produk yang sudah digenerate AI.",
					},
				],
			},
		});

		expect(screen.getByText("Tahap PRD · Ringkasan tersimpan")).toBeDefined();
		expect(screen.queryByText("Menunggu PRD")).toBeNull();
	});

	it("reports a missing summary instead of inventing progress", () => {
		renderDrawer({
			override: { items: [{ ...mockItems[0], step: "prd", preview: null }] },
		});

		expect(screen.getByText("Tahap PRD · Belum ada ringkasan")).toBeDefined();
	});

	it("only claims completion when the real status says completed", () => {
		renderDrawer({
			override: {
				items: [
					{ ...mockItems[0], step: "ac", acStatus: "completed" },
					{
						...mockItems[1],
						step: "ac",
						acStatus: "pending",
					},
				],
			},
		});

		expect(screen.getByText("Tahap AC · AC selesai")).toBeDefined();
		expect(screen.getByText("Tahap AC · AC belum selesai")).toBeDefined();
	});
});

describe("toDrawerItems", () => {
	it("maps every real project to the plan category and resolves its real route", () => {
		const items = toDrawerItems([
			{
				id: SIMRS_ID,
				name: "E-Commerce SIMRS",
				step: "ac",
				lastUrl: null,
				updatedAt: new Date("2026-09-28T04:00:00.000Z"),
				preview: null,
				acStatus: "completed",
				taskStatus: null,
			},
			{
				id: AIRBNB_ID,
				name: "Airbnb Landing Scrap",
				step: null,
				lastUrl: `/task/${AIRBNB_ID}`,
				updatedAt: "2026-09-20T04:00:00.000Z",
				preview: null,
				acStatus: null,
				taskStatus: "completed",
			},
		]);

		expect(items).toHaveLength(2);
		expect(items[0].type).toBe("plan");
		expect(items[0].url).toBe(`/ac/${SIMRS_ID}`);
		expect(items[0].updatedAt).toBeInstanceOf(Date);
		// A serialized timestamp must survive the server-function boundary as a Date.
		expect(items[1].updatedAt).toBeInstanceOf(Date);
		expect(items[1].url).toBe(`/task/${AIRBNB_ID}`);
	});
});



