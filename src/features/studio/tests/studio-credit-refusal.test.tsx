// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLoaderData = vi.fn();
const mockNavigate = vi.fn(async () => {});

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useLoaderData: () => mockUseLoaderData(),
	}),
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
	useNavigate: () => mockNavigate,
	useRouter: () => ({ invalidate: vi.fn(async () => {}) }),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({
			handler: (fn: unknown) => fn,
		}),
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(),
}));

import { Route } from "@/routes/design/$id";

// cast boundary: the file route object carries its page component untagged, so
// the test reads it through one named alias instead of inline member access.
const StudioDetailPage = (
	Route as unknown as { component: React.ComponentType }
).component;

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

const loaderData = {
	project: {
		id: "proj-1",
		title: "Anggaran Triwulan",
		designMode: "mobile",
		designMd: null,
		logoAssetId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	frames: [
		{
			id: "f-1",
			projectId: "proj-1",
			name: "Ringkasan",
			description: "Ringkasan",
			viewport: "mobile",
			htmlCode: "<html><body>Ringkasan</body></html>",
			status: "ready",
			order: 0,
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	],
	activeJob: null,
	logoUrl: null,
	revisions: [],
	latest: null,
};

/** Status polling and the quote preflight answer normally; the operation refuses. */
function fetchRefusingOperation(status: number, code: string) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		if (init?.method === "POST" && String(url).includes("/api/studio/frame"))
			return {
				ok: false,
				status,
				json: async () => ({ error: "Kredit tidak cukup", code }),
				clone: () => ({
					json: async () => ({ error: "Kredit tidak cukup", code }),
				}),
			} as unknown as Response;
		return {
			ok: true,
			status: 200,
			json: async () => ({ frames: [] }),
			clone: () => ({ json: async () => ({ frames: [] }) }),
		} as unknown as Response;
	});
}

async function submitPrompt() {
	fireEvent.change(screen.getByRole("textbox"), {
		target: { value: "Tambahkan layar rincian anggaran per unit" },
	});
	fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));
}

describe("Studio credit refusal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUseLoaderData.mockReturnValue(structuredClone(loaderData));
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				matches: true,
				addEventListener: () => {},
				removeEventListener: () => {},
			})),
		);
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("opens the credit modal when the operation endpoint refuses on balance", async () => {
		// cast boundary: the mock answers with the response fields the client reads,
		// not a full Response instance.
		global.fetch = fetchRefusingOperation(
			402,
			"INSUFFICIENT_CREDITS",
		) as unknown as typeof fetch;
		render(
			<QueryClientProvider client={queryClient}>
				<StudioDetailPage />
			</QueryClientProvider>,
		);

		await submitPrompt();

		await waitFor(() => {
			expect(screen.getByText(/Kredit Habis/i)).toBeDefined();
		});
		expect(mockNavigate).not.toHaveBeenCalledWith({ to: "/pricing" });
	});

	it("routes to pricing when the product plan does not include the operation", async () => {
		// cast boundary: same partial-response mock as the balance case above.
		global.fetch = fetchRefusingOperation(
			402,
			"PRODUCT_PLAN_REQUIRED",
		) as unknown as typeof fetch;
		render(
			<QueryClientProvider client={queryClient}>
				<StudioDetailPage />
			</QueryClientProvider>,
		);

		await submitPrompt();

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/pricing" });
		});
		expect(screen.queryByText(/Kredit Habis/i)).toBeNull();
	});
});
