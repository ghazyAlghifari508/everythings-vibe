// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerState = vi.hoisted(() => ({
	search: {
		mode: "html",
		status: "failed",
		q: "stitch",
		sort: "oldest",
		page: 2,
		pageSize: 10,
	} as Record<string, unknown>,
	loaderData: {
		items: [
			{
				id: "row-1",
				sourceUrl: "https://example.test/",
				domain: "example.test",
				title: null,
				status: "failed",
				mode: "design",
				createdAt: "2026-10-14T00:00:00.000Z",
			},
		],
		total: 33,
		page: 2,
		pageSize: 10,
	} as Record<string, unknown>,
	navigate: vi.fn(),
	invalidate: vi.fn(),
}));

const loaderMocks = vi.hoisted(() => ({
	deleteScrapeItem: vi.fn().mockResolvedValue({ ok: true }),
	deleteScrapeItems: vi
		.fn()
		.mockResolvedValue({ deleted: 1, skipped: 0, deletedIds: ["row-1"] }),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		options,
		useLoaderData: () => routerState.loaderData,
		useSearch: () => routerState.search,
	}),
	useNavigate: () => routerState.navigate,
	useRouter: () => ({ invalidate: routerState.invalidate }),
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

vi.mock("@/features/scrape/services/scrape-history-loader.functions", () => ({
	deleteScrapeItem: loaderMocks.deleteScrapeItem,
	deleteScrapeItems: loaderMocks.deleteScrapeItems,
	loadScrapesHistory: vi.fn(),
	prepareScrapeHistorySelection: vi.fn(),
}));

import { Route } from "@/routes/scrape/history";

function installRadixDomPolyfills() {
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

function renderHistoryRoute() {
	const Component = Route.options.component;
	if (typeof Component !== "function") {
		throw new Error("The history route must expose a component.");
	}
	return render(<Component />);
}

async function deleteFirstRow() {
	const trigger = screen.getByRole("button", { name: /Aksi riwayat/i });
	fireEvent.pointerDown(trigger, {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
	fireEvent.click(screen.getByRole("menuitem", { name: /Hapus hasil/i }));
	fireEvent.click(screen.getByRole("button", { name: /konfirmasi hapus/i }));
	await vi.waitFor(() =>
		expect(loaderMocks.deleteScrapeItem).toHaveBeenCalledWith({
			data: "row-1",
		}),
	);
}

beforeEach(() => {
	installRadixDomPolyfills();
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
});

describe("scrape history route deletion", () => {
	it("refreshes the count in place when the current page still exists", async () => {
		routerState.loaderData = {
			...routerState.loaderData,
			total: 33,
			page: 2,
		};
		routerState.search = {
			mode: "html",
			status: "failed",
			q: "stitch",
			sort: "oldest",
			page: 2,
			pageSize: 10,
		};
		renderHistoryRoute();

		await deleteFirstRow();

		expect(routerState.invalidate).toHaveBeenCalledTimes(1);
		expect(routerState.navigate).not.toHaveBeenCalled();
	});

	it("steps back to the last existing page and keeps the filter state", async () => {
		routerState.loaderData = {
			...routerState.loaderData,
			total: 41,
			page: 5,
		};
		routerState.search = {
			mode: "html",
			status: "failed",
			q: "stitch",
			sort: "oldest",
			page: 5,
			pageSize: 10,
		};
		renderHistoryRoute();

		await deleteFirstRow();

		expect(routerState.navigate).toHaveBeenCalledTimes(1);
		const call = routerState.navigate.mock.calls[0][0] as {
			to: string;
			search: (previous: Record<string, unknown>) => Record<string, unknown>;
		};
		expect(call.to).toBe(".");
		expect(
			call.search({
				mode: "html",
				status: "failed",
				q: "stitch",
				sort: "oldest",
				page: 5,
				pageSize: 10,
			}),
		).toEqual({
			mode: "html",
			status: "failed",
			q: "stitch",
			sort: "oldest",
			page: 4,
			pageSize: 10,
		});
	});

	it("keeps the user on the first page when the last result is removed", async () => {
		routerState.loaderData = {
			...routerState.loaderData,
			total: 1,
			page: 1,
		};
		routerState.search = {
			mode: undefined,
			status: undefined,
			q: "",
			sort: "newest",
			page: 1,
			pageSize: 10,
		};
		renderHistoryRoute();

		await deleteFirstRow();

		expect(routerState.invalidate).toHaveBeenCalledTimes(1);
		expect(routerState.navigate).not.toHaveBeenCalled();
	});
});
