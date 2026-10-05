import { expect, test } from "@playwright/test";

/**
 * Browser verification for the merged existing-codebase onboarding step.
 *
 * Loads the REAL app document (so Vite injects the `@vitejs/plugin-react`
 * preamble and the app's module graph is live), then mounts the shipped
 * components into detached containers. The DOM inspected is genuine browser
 * rendering of the shipped component code — not jsdom.
 *
 * The mount script is passed as a STRING on purpose. It runs in the browser and
 * its `import()` specifiers are dev-server URLs (`/@id/...`, `/src/...`), which
 * `tsc` cannot resolve from disk; keeping it as a string preserves the real
 * browser boundary instead of forcing fake module declarations.
 */

const MOUNT_SCRIPT = `(async () => {
  const React = (await import("/@id/react")).default;
  // CJS interop: the namespace is exposed on \`default\`.
  const { createRoot } = (await import("/@id/react-dom/client")).default;
  const { ScreenConnect } = await import("/src/components/codebase/screen-connect.tsx");

  const connectRoot = document.createElement("div");
  connectRoot.id = "verify-connect";
  document.body.appendChild(connectRoot);

  const payload = {
    projectId: "proj_verify_123",
    apiBaseUrl: "https://prdfy.example.com",
    syncToken: "tok_verify",
    cliMinVersion: "2.0.0",
    syncCommand: "vibeeverything codebase sync --project-id proj_verify_123 --sync-token <token>",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };

  createRoot(connectRoot).render(
    React.createElement(ScreenConnect, {
      projectName: "Wishlist Fitur",
      payload,
      // The reconciled status the owning screen polled: a finished upload for
      // the current attempt.
      status: {
        projectId: "proj_verify_123",
        sessionId: "sess_verify_123",
        status: "uploaded",
        fileCount: 12,
        excludedCount: 3,
        snapshotId: "snap_1",
        analysisStatus: "pending",
      },
      canContinueToSummary: true,
      onContinueToSummary: () => {},
    }),
  );

  return true;
})()`;

async function mountComponents(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.waitForLoadState("domcontentloaded");
	return page.evaluate(MOUNT_SCRIPT);
}

test.describe("existing-codebase onboarding — real browser render", () => {
	test("the instruction screen reports three real sync stages and nothing invented", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));

		await mountComponents(page);
		const connect = page.locator("#verify-connect");
		await expect(connect).toContainText("Agent terhubung", { timeout: 20000 });

		const text = (await connect.innerText()) ?? "";
		expect(text).toContain("Agent terhubung");
		expect(text).toContain("Source code siap");
		expect(text).toContain("Sinkronisasi selesai");
		// Real counts straight from the server payload.
		expect(text).toContain("12");
		expect(text).toContain("3");
		// AI analysis is a separate capability, never a sync stage.
		expect(text).not.toMatch(/menganalisis codebase/i);
		expect(text).not.toMatch(/analisis codebase selesai/i);
		expect(
			await connect.locator('[data-testid="sync-stage-analysis"]').count(),
		).toBe(0);
		// Exactly the three product stages, rendered once each.
		for (const stage of [
			"sync-stage-agent",
			"sync-stage-preparing",
			"sync-stage-sync",
		]) {
			expect(
				await connect.locator(`[data-testid="${stage}"]`).count(),
				`missing stage ${stage}`,
			).toBe(1);
		}
		// No backend enum name or transport jargon in the user-facing copy.
		for (const internal of [
			"waiting_for_cli",
			"handshake",
			"polling",
			"manifest",
			"filtering",
			"uploading",
			"snapshot",
		]) {
			expect(text, `leaked ${internal}`).not.toContain(internal);
		}
		// No fabricated percentage.
		expect(text).not.toContain("%");
		// There is exactly one progress surface in the whole step.
		expect(await connect.locator('[data-testid="sync-card"]').count()).toBe(0);
		expect(text).not.toMatch(/Pantau Sync/i);
		expect(text).not.toMatch(/Prompt Sync/i);
		expect(errors).toEqual([]);
	});

	test("substep 3 instructs the user instead of describing the mechanism", async ({
		page,
	}) => {
		await mountComponents(page);
		const text =
			(await page.locator("#verify-connect").innerText()) ?? "";
		expect(text).toContain(
			"Jalankan prompt dari root repository untuk mulai menyinkronkan codebase.",
		);
		expect(text).not.toMatch(/mengikuti server/i);
		expect(text).not.toMatch(/tidak berpindah sendiri/i);
		expect(text).not.toMatch(/progresses/i);
	});

	test("a finished upload unlocks the conclusion step", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));

		await mountComponents(page);
		const cta = page.locator('[data-testid="sync-continue-to-summary"]');
		await expect(cta).toBeVisible({ timeout: 20000 });
		await expect(cta).toBeEnabled();
		await expect(cta).toContainText("Lanjut ke Kesimpulan");
		expect(errors).toEqual([]);
	});

	test("instruction screen renders the self-contained execution prompt", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));

		await mountComponents(page);
		const connect = page.locator("#verify-connect");
		await expect(connect).toContainText(
			"Sinkronkan codebase repositori lokal ini",
			{ timeout: 20000 },
		);

		const text = (await connect.innerText()) ?? "";
		expect(text).toContain("proj_verify_123");
		expect(text).toContain(
			"vibeeverything codebase sync --project-id proj_verify_123",
		);
		expect(text).toContain("Wishlist Fitur");
		// Every required section renders in the real browser.
		for (const heading of [
			"## Informasi Project",
			"## Prasyarat Eksekusi",
			"## Perintah Yang Harus Dieksekusi",
			"## Yang Dilakukan CLI Otomatis",
			"## Aturan Yang Wajib Dipatuhi",
			"## Penanganan Kegagalan",
			"## Format Laporan Akhir",
		]) {
			expect(text, `missing section: ${heading}`).toContain(heading);
		}
		expect(text).toContain(".prdfyignore");
		// Robotic scaffolding, version gate, and path-pattern ignore lists are gone.
		expect(text).not.toMatch(/Langkah \d/);
		expect(text).not.toContain("2.0.0");
		expect(text).not.toContain("node_modules");
		expect(errors).toEqual([]);
	});
});
