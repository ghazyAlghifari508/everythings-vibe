// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryDrawer, toDrawerItems } from "./history-drawer";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
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
		acStatus: "completed",
		taskStatus: "completed",
	},
];

let queryClient: QueryClient;

function renderDrawer(props: Partial<React.ComponentProps<typeof HistoryDrawer>>) {
	return render(
		<QueryClientProvider client={queryClient}>
			<HistoryDrawer
				isOpen
				onClose={() => {}}
				items={mockItems}
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
		renderDrawer({ items: [] });

		expect(screen.getByText(/Belum ada riwayat projek/i)).toBeDefined();
	});

	// Phase 1 has no design/scrap tables, so the real query only ever yields
	// plan rows. These pills must therefore report an honest empty result
	// rather than a spinner or an invented row.
	const phaseOneItems = [mockItems[0]];

	it("reports an honest empty state for the VibeDesign category", () => {
		renderDrawer({ items: phaseOneItems });

		fireEvent.click(filterPills().getByRole("button", { name: "VibeDesign" }));

		expect(screen.getByText("Belum ada desain tersimpan.")).toBeDefined();
	});

	it("reports an honest empty state for the Scrap category", () => {
		renderDrawer({ items: phaseOneItems });

		fireEvent.click(filterPills().getByRole("button", { name: "Scrap" }));

		expect(screen.getByText("Belum ada hasil scrap.")).toBeDefined();
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
