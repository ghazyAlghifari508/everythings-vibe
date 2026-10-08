import { expect, test } from "@playwright/test";

const MOUNT_PROGRESS = `(async () => {
  const React = (await import("/@id/react")).default;
  const { createRoot } = (await import("/@id/react-dom/client")).default;
  const { ScrapeProgress } = await import("/src/components/design/scrape-progress.tsx");
  const mount = document.createElement("div");
  mount.id = "verify-scrape-progress";
  document.body.appendChild(mount);
  createRoot(mount).render(React.createElement(ScrapeProgress, {
    mode: "design",
    status: "generating",
    sourceUrl: "https://www.notion.com/",
    domain: "www.notion.com",
    activity: "Memvalidasi DESIGN.md",
    activityStartedAt: new Date(Date.now() - 12000).toISOString(),
  }));
  return true;
})()`;

test("scrape progress motion stops when reduced motion is requested", async ({
	page,
}) => {
	await page.goto("/");
	await page.waitForLoadState("domcontentloaded");
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.evaluate(MOUNT_PROGRESS);

	const progress = page.locator("#verify-scrape-progress");
	await expect(progress.getByRole("progressbar", { name: "Kemajuan pemrosesan" })).toBeVisible();
	await expect(progress.getByRole("status", { name: "Aktivitas berlangsung" })).toContainText("Memvalidasi DESIGN.md");
	const activeSegment = progress.locator('[data-segment-state="active"] [data-stage-motion]');
	const activityDot = progress.locator("[data-activity-dot]").first();
	await expect(activeSegment).toHaveCount(1);
	await expect(activityDot).toBeVisible();
	await expect
		.poll(() => activeSegment.evaluate((element) => getComputedStyle(element).animationName))
		.toBe("pulse");
	await expect
		.poll(() => activityDot.evaluate((element) => getComputedStyle(element).animationName))
		.toBe("pulse");

	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect
		.poll(() => activeSegment.evaluate((element) => getComputedStyle(element).animationName))
		.toBe("none");
	await expect
		.poll(() => activityDot.evaluate((element) => getComputedStyle(element).animationName))
		.toBe("none");
});
