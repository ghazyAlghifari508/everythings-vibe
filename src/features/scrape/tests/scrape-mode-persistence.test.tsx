// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	RouterProvider,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrapeWorkspaceView } from "../components/scrape-workspace-view";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "../types/scrape-contract";
import {
	getRememberedScrapeMode,
	isScrapeMode,
	resolveActiveScrapeMode,
	SCRAPE_MODE_SESSION_KEY,
	saveRememberedScrapeMode,
} from "../utils/scrape-mode-session";

afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.unstubAllGlobals();
});

beforeEach(() => {
	sessionStorage.clear();
});

function createTestRouter(initialUrl: string) {
	const root = createRootRoute();

	function ScrapePageComponent() {
		const search = parseScrapeWorkspaceSearch(workspaceRoute.useSearch());
		const navigate = useNavigate();
		const mode = resolveScrapeWorkspaceMode(search);

		useEffect(() => {
			if (search.mode) {
				saveRememberedScrapeMode(search.mode);
			} else {
				const remembered = getRememberedScrapeMode();
				if (remembered) {
					void navigate({
						to: "/scrape",
						search: { mode: remembered },
						replace: true,
					});
				}
			}
		}, [search.mode, navigate]);

		return <ScrapeWorkspaceView initialMode={mode} mode={mode} />;
	}

	const workspaceRoute = createRoute({
		getParentRoute: () => root,
		path: "/scrape",
		validateSearch: parseScrapeWorkspaceSearch,
		beforeLoad: ({ search }) => {
			if (typeof window !== "undefined" && !search.mode) {
				const remembered = getRememberedScrapeMode();
				if (remembered) {
					throw redirect({
						to: "/scrape",
						search: { mode: remembered },
						replace: true,
					});
				}
			}
		},
		component: ScrapePageComponent,
	});

	const historyRoute = createRoute({
		getParentRoute: () => root,
		path: "/scrape/history",
		component: () => (
			<div>
				<h1>Halaman Riwayat</h1>
				<Link to="/scrape" data-testid="nav-to-scrape">
					VibeScrape
				</Link>
			</div>
		),
	});

	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const router = createRouter({
		routeTree: root.addChildren([workspaceRoute, historyRoute]),
		history,
	});

	return router;
}

async function renderRouter(initialUrl: string) {
	const router = createTestRouter(initialUrl);
	await router.load();
	render(<RouterProvider router={router} />);
	return router;
}

describe("VibeScrape Mode Persistence & Navigation", () => {
	describe("1. Mode Selection & URL Synchronization", () => {
		it("updates tab selection and URL search param on click", async () => {
			const router = await renderRouter("/scrape");

			const imagesTab = screen.getByRole("tab", { name: "Scrape Images" });
			fireEvent.click(imagesTab);

			await waitFor(() => {
				expect(imagesTab.getAttribute("aria-selected")).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "images" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("images");
			expect(
				screen.getByText(
					"Temukan gambar, sumber aset, dan metadata dari halaman website.",
				),
			).toBeDefined();
		});

		it("updates tab selection and URL search param for HTML mode", async () => {
			const router = await renderRouter("/scrape");

			const htmlTab = screen.getByRole("tab", { name: "Scrape HTML" });
			fireEvent.click(htmlTab);

			await waitFor(() => {
				expect(htmlTab.getAttribute("aria-selected")).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "html" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("html");
		});

		it("updates tab selection and URL search param for Crawl mode", async () => {
			const router = await renderRouter("/scrape");

			const crawlTab = screen.getByRole("tab", { name: "Crawl Website" });
			fireEvent.click(crawlTab);

			await waitFor(() => {
				expect(crawlTab.getAttribute("aria-selected")).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "crawl" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("crawl");
		});
	});

	describe("2. Navigation away and back (Riwayat → Scrape)", () => {
		it("preserves Scrape Images mode when navigating to Riwayat and returning via VibeScrape nav", async () => {
			const router = await renderRouter("/scrape");

			// 1. Select Scrape Images
			fireEvent.click(screen.getByRole("tab", { name: "Scrape Images" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "images" });
			});

			// 2. Navigate away to Riwayat
			await router.navigate({ to: "/scrape/history" });
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/scrape/history");
			});
			expect(
				screen.getByRole("heading", { name: "Halaman Riwayat" }),
			).toBeDefined();

			// 3. Click nav back to VibeScrape (which navigates to /scrape without query)
			fireEvent.click(screen.getByTestId("nav-to-scrape"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/scrape");
			});

			// 4. Mode MUST be restored to Scrape Images, not DESIGN.md!
			await waitFor(() => {
				const imagesTab = screen.getByRole("tab", { name: "Scrape Images" });
				expect(imagesTab.getAttribute("aria-selected")).toBe("true");
			});
			expect(router.state.location.search).toEqual({ mode: "images" });
		});

		it("preserves Scrape HTML mode when navigating to Riwayat and returning", async () => {
			const router = await renderRouter("/scrape");

			// 1. Select Scrape HTML
			fireEvent.click(screen.getByRole("tab", { name: "Scrape HTML" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "html" });
			});

			// 2. Navigate away to Riwayat
			await router.navigate({ to: "/scrape/history" });
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/scrape/history");
			});

			// 3. Return to VibeScrape
			fireEvent.click(screen.getByTestId("nav-to-scrape"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/scrape");
			});

			// 4. Must be Scrape HTML
			await waitFor(() => {
				const htmlTab = screen.getByRole("tab", { name: "Scrape HTML" });
				expect(htmlTab.getAttribute("aria-selected")).toBe("true");
			});
			expect(router.state.location.search).toEqual({ mode: "html" });
		});
	});

	describe("3. Browser History (Back / Forward)", () => {
		it("syncs tab state correctly on browser back and forward", async () => {
			const router = await renderRouter("/scrape?mode=crawl");

			expect(
				screen
					.getByRole("tab", { name: "Crawl Website" })
					.getAttribute("aria-selected"),
			).toBe("true");

			// Switch to Scrape HTML
			fireEvent.click(screen.getByRole("tab", { name: "Scrape HTML" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "html" });
			});

			// Switch to Scrape Images
			fireEvent.click(screen.getByRole("tab", { name: "Scrape Images" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "images" });
			});

			// Back -> HTML
			router.history.back();
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "html" });
				expect(
					screen
						.getByRole("tab", { name: "Scrape HTML" })
						.getAttribute("aria-selected"),
				).toBe("true");
			});

			// Back -> Crawl
			router.history.back();
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "crawl" });
				expect(
					screen
						.getByRole("tab", { name: "Crawl Website" })
						.getAttribute("aria-selected"),
				).toBe("true");
			});

			// Forward -> HTML
			router.history.forward();
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "html" });
				expect(
					screen
						.getByRole("tab", { name: "Scrape HTML" })
						.getAttribute("aria-selected"),
				).toBe("true");
			});
		});
	});

	describe("4. Direct URL Access & Precedence", () => {
		it("direct URL /scrape?mode=images takes top precedence even if session had another mode", async () => {
			sessionStorage.setItem(SCRAPE_MODE_SESSION_KEY, "crawl");
			const router = await renderRouter("/scrape?mode=images");

			expect(
				screen
					.getByRole("tab", { name: "Scrape Images" })
					.getAttribute("aria-selected"),
			).toBe("true");
			expect(router.state.location.search).toEqual({ mode: "images" });
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("images");
		});

		it("direct URL without mode falls back to session-remembered mode", async () => {
			sessionStorage.setItem(SCRAPE_MODE_SESSION_KEY, "html");
			const router = await renderRouter("/scrape");

			await waitFor(() => {
				expect(
					screen
						.getByRole("tab", { name: "Scrape HTML" })
						.getAttribute("aria-selected"),
				).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "html" });
			});
		});

		it("first visit without URL mode or session storage defaults to design mode", async () => {
			const router = await renderRouter("/scrape");

			expect(
				screen
					.getByRole("tab", { name: "Generate DESIGN.md" })
					.getAttribute("aria-selected"),
			).toBe("true");
			expect(router.state.location.search).toEqual({});
		});

		it("invalid URL mode falls back to session mode or default design", async () => {
			sessionStorage.setItem(SCRAPE_MODE_SESSION_KEY, "crawl");
			const router = await renderRouter("/scrape?mode=malicious_attack");

			await waitFor(() => {
				expect(
					screen
						.getByRole("tab", { name: "Crawl Website" })
						.getAttribute("aria-selected"),
				).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "crawl" });
			});
		});
	});

	describe("5. Keyboard Navigation (Arrow, Home, End)", () => {
		it("cycles through modes via keyboard and updates URL and session", async () => {
			const router = await renderRouter("/scrape");

			const designTab = screen.getByRole("tab", { name: "Generate DESIGN.md" });
			expect(designTab.getAttribute("aria-selected")).toBe("true");

			// ArrowRight -> HTML
			fireEvent.keyDown(designTab, { key: "ArrowRight" });
			await waitFor(() => {
				expect(
					screen
						.getByRole("tab", { name: "Scrape HTML" })
						.getAttribute("aria-selected"),
				).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "html" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("html");

			// End -> Images (last)
			fireEvent.keyDown(screen.getByRole("tab", { name: "Scrape HTML" }), {
				key: "End",
			});
			await waitFor(() => {
				expect(
					screen
						.getByRole("tab", { name: "Scrape Images" })
						.getAttribute("aria-selected"),
				).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "images" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("images");

			// Home -> Crawl (first)
			fireEvent.keyDown(screen.getByRole("tab", { name: "Scrape Images" }), {
				key: "Home",
			});
			await waitFor(() => {
				expect(
					screen
						.getByRole("tab", { name: "Crawl Website" })
						.getAttribute("aria-selected"),
				).toBe("true");
				expect(router.state.location.search).toEqual({ mode: "crawl" });
			});
			expect(sessionStorage.getItem(SCRAPE_MODE_SESSION_KEY)).toBe("crawl");
		});
	});

	describe("6. Form State & Shared Input Preservation", () => {
		it("preserves URL input across mode switches and submits the active mode", async () => {
			const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
				ok: true,
				json: async () => ({ scrapeId: "scrape-task-123" }),
			}));
			vi.stubGlobal("fetch", fetchMock);

			const router = await renderRouter("/scrape");

			// Type URL input
			const input = screen.getByLabelText("URL website");
			fireEvent.change(input, {
				target: { value: "https://mywebsite.test/showcase" },
			});

			// Switch to Crawl
			fireEvent.click(screen.getByRole("tab", { name: "Crawl Website" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "crawl" });
			});

			// URL input is STILL preserved!
			expect(screen.getByLabelText<HTMLInputElement>("URL website").value).toBe(
				"mywebsite.test/showcase",
			);

			// Switch to Scrape Images
			fireEvent.click(screen.getByRole("tab", { name: "Scrape Images" }));
			await waitFor(() => {
				expect(router.state.location.search).toEqual({ mode: "images" });
			});

			// URL input is STILL preserved!
			expect(screen.getByLabelText<HTMLInputElement>("URL website").value).toBe(
				"mywebsite.test/showcase",
			);

			// Submit the form
			const submitBtn = screen.getByRole("button", {
				name: "Jalankan Scrape Images",
			});
			fireEvent.click(submitBtn);

			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			const [callUrl, callInit] = fetchMock.mock.calls[0];
			expect(callUrl).toBe("/api/scrape");
			const parsedBody = JSON.parse(callInit.body as string);
			expect(parsedBody.mode).toBe("images");
			expect(parsedBody.url).toBe("https://mywebsite.test/showcase");
		});
	});

	describe("7. SSR & Storage Fallback Resilience", () => {
		it("safely handles storage errors without throwing", () => {
			expect(isScrapeMode("design")).toBe(true);
			expect(isScrapeMode("invalid")).toBe(false);
			expect(isScrapeMode(null)).toBe(false);

			expect(resolveActiveScrapeMode("html")).toBe("html");
			expect(resolveActiveScrapeMode("unknown")).toBe("design");
		});
	});
});
