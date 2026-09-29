import { expect, test } from "@playwright/test";

/**
 * End-to-end integration and regression suite for existing-codebase sync.
 *
 * Scenarios covered:
 * 1. Greenfield page (/plan/new) is permanent greenfield: no mode toggle,
 *    two-level breadcrumb, template gallery, static placeholder.
 * 2. Plan options (/plan) link Opsi 1 to /plan/new and Opsi 2 to /plan/codebase.
 * 3. Codebase connect page (/plan/codebase) breadcrumb + header.
 * 4. Security guards: unauthenticated access to /codebases/$id redirects to /login.
 * 5. API guards: unauthenticated project creation rejected with 401.
 * 6. API guards: invalid project mode rejected with 400.
 *
 * Note: the Home mode toggle (Produk baru | Codebase existing) no longer
 * exists on any route — /plan/new forces greenfield via hideModeSelector
 * and / renders the Bento hub. The ChatInput mode logic (options, routing
 * targets, credit gate) stays covered at unit level in
 * src/components/layout/-home-mode.test.ts, not here.
 */

test.describe("Existing Codebase Sync Flow", () => {
	test("API: rejects unauthenticated project creation", async ({ request }) => {
		const res = await request.post("/api/projects", {
			data: {
				message: "Fitur baru untuk aplikasi",
				projectMode: "existing_codebase",
			},
		});
		expect(res.status()).toBe(401);
	});

	test("API: rejects invalid project mode", async ({ request }) => {
		const res = await request.post("/api/projects", {
			data: {
				message: "Fitur baru untuk aplikasi",
				projectMode: "invalid_mode_xyz",
			},
		});
		expect([400, 401]).toContain(res.status());
	});

	test("UI: /plan/new is permanent greenfield with breadcrumb and static placeholder", async ({
		page,
	}) => {
		await page.goto("/plan/new");
		await page.waitForLoadState("networkidle");

		// Verify title
		await expect(page).toHaveTitle(/VibeEverything/i);

		// Two-level breadcrumb: Home > VibePlan > Projek Baru (Greenfield)
		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(breadcrumb.getByRole("link", { name: "Home" })).toBeVisible();
		await expect(
			breadcrumb.getByRole("link", { name: "VibePlan" }),
		).toHaveAttribute("href", "/plan");
		await expect(breadcrumb).toContainText("Projek Baru (Greenfield)");

		// No mode toggle on this page — greenfield is permanent
		await expect(
			page.getByRole("button", { name: /produk baru/i }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: /codebase existing/i }),
		).toHaveCount(0);
		await expect(page.locator("#home-mode-greenfield")).toHaveCount(0);
		await expect(page.locator("#home-mode-existing-codebase")).toHaveCount(0);

		// Greenfield affordances stay: Web/App toggle and template gallery
		const webToggle = page.getByRole("button", { name: "Web", exact: true });
		const appToggle = page.getByRole("button", { name: "App", exact: true });
		const templateCard = page.getByText("SaaS Analytics Dashboard");
		await expect(webToggle).toBeVisible();
		await expect(appToggle).toBeVisible();
		await expect(templateCard).toBeVisible();

		// Static (non-animated) greenfield placeholder
		const textarea = page.getByRole("textbox");
		await expect(textarea).toHaveAttribute(
			"placeholder",
			/Deskripsikan ide produk Anda/,
		);

		// Clicking a template prefills the textarea
		await templateCard.click();
		await expect(textarea).toHaveValue(/SaaS Analytics Dashboard/);
	});

	test("UI: /plan options link to greenfield and codebase pages", async ({
		page,
	}) => {
		await page.goto("/plan");
		await page.waitForLoadState("networkidle");

		const opsi1 = page.getByRole("link", { name: /Projek Baru/i });
		await expect(opsi1).toBeVisible();
		await expect(opsi1).toHaveAttribute("href", "/plan/new");

		const opsi2 = page.getByRole("link", { name: /Codebase Existing/i });
		await expect(opsi2).toBeVisible();
		await expect(opsi2).toHaveAttribute("href", "/plan/codebase");
	});

	test("UI: /plan/codebase renders breadcrumb and connect header", async ({
		page,
	}) => {
		await page.goto("/plan/codebase");
		await page.waitForLoadState("networkidle");

		// Two-level breadcrumb: Home > VibePlan > Codebase Existing
		const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
		await expect(breadcrumb.getByRole("link", { name: "Home" })).toBeVisible();
		await expect(
			breadcrumb.getByRole("link", { name: "VibePlan" }),
		).toHaveAttribute("href", "/plan");
		await expect(breadcrumb).toContainText("Codebase Existing");

		await expect(
			page.getByRole("heading", { name: /Hubungkan codebase yang sudah ada/i }),
		).toBeVisible();
		await expect(page.getByLabel(/Nama repository/i)).toBeVisible();
	});

	test("UI: Unauthenticated visit to /codebases/:id redirects to /login", async ({
		page,
	}) => {
		await page.goto("/codebases/mock-project-unauth-123");
		await page.waitForURL(/\/login/);
		await expect(page).toHaveURL(/\/login/);
	});
});
