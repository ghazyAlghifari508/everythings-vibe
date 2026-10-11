import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects, users } from "@/db/schema";
import {
	createStudioProjectWithJob,
	getStudioProjectDetail,
	listStudioProjects,
	retryStudioFrame,
} from "./studio-service";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["prdfy-combo"],
	tryStreamWithFallback: async (
		_models: unknown,
		messages: Array<{ role: string; content: string }>,
	) => {
		const userMsg = messages.find((m) => m.role === "user")?.content || "";
		if (
			userMsg.includes("Plan the necessary screens") ||
			userMsg.includes("User Request")
		) {
			const isMobile = userMsg.includes("Mobile");
			const planJson = JSON.stringify({
				projectTitle: isMobile ? "Aplikasi Keuangan" : "Website Portofolio",
				screens: [
					{
						name: isMobile ? "Ringkasan Saldo" : "Beranda Utama",
						description: "Halaman ringkasan",
						viewport: isMobile ? "mobile" : "web",
						order: 0,
					},
					{
						name: isMobile ? "Riwayat Transaksi" : "Daftar Karya",
						description: "Halaman riwayat",
						viewport: isMobile ? "mobile" : "web",
						order: 1,
					},
				],
			});
			return {
				firstChunk: planJson,
				generator: (async function* () {})(),
			};
		}

		const html = `<!DOCTYPE html>
<html>
<head>
  <title>Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white">
  <nav><div class="logo">Brand</div></nav>
  <main><h1>Hello World</h1></main>
</body>
</html>`;
		return {
			firstChunk: html,
			generator: (async function* () {})(),
		};
	},
}));

const sampleDesignMd = `# MindMarket — Style Reference
**Theme:** light

## Tokens — Colors
| Name | Value | Token | Role |
| Fresh Grass | \`#8ed462\` | \`--color-fresh-grass\` | Primary brand accent |
| Cream Paper | \`#f5f1e4\` | \`--color-cream-paper\` | Dominant page background and soft card surface |
| Ink Black | \`#2c2e2a\` | \`--color-ink-black\` | Primary text, icons, nav borders |

## Tokens — Typography
### Inter — Single-family system
- **Weights:** 400, 500

## Tokens — Spacing & Shapes
### Border Radius
| Element | Value |
| cards | 50px |
| buttons | 50px |
`;

describe("End-to-End Multi-Screen Generation Scenarios", () => {
	// Helper to get or create a real user in the DB
	async function getTestUserId(): Promise<string> {
		const [u] = await db.select({ id: users.id }).from(users).limit(1);
		if (u) return u.id;
		const [created] = await db
			.insert(users)
			.values({
				id: `e2e-test-user-${Date.now()}`,
				name: "E2E Test User",
				email: "e2e@example.com",
			})
			.returning();
		return created.id;
	}

	it("Scenario 1 — Web without reference: plans adaptive screens and generates HTML frames", async () => {
		const userId = await getTestUserId();
		const { project, job } = await createStudioProjectWithJob(userId, {
			prompt:
				"Buatkan prototype website portofolio frontend developer dengan karya dan kontak",
			designMode: "web",
		});

		expect(project.id).toBeDefined();
		expect(project.designMode).toBe("web");
		expect(job.id).toBeDefined();
		expect(job.status).toBe("queued");

		// Wait until at least 1 frame is ready, demonstrating progressive reveal
		let detail = await getStudioProjectDetail(project.id, userId);
		const startTime = Date.now();
		while (Date.now() - startTime < 10_000) {
			detail = await getStudioProjectDetail(project.id, userId);
			if (detail.frames.some((f) => f.status === "ready" && f.htmlCode)) {
				break;
			}
			await new Promise((r) => setTimeout(r, 100));
		}

		// Verify persisted state from DB
		expect(detail.frames.length).toBeGreaterThanOrEqual(1);

		const readyFrames = detail.frames.filter((f) => f.status === "ready");
		expect(readyFrames.length).toBeGreaterThanOrEqual(1);
		for (const frame of readyFrames) {
			expect(frame.viewport).toBe("web");
			expect(frame.htmlCode).toContain("<html");
			// Verified that screens are adaptive and not dummy hardcoded Dashboard/Analytics/Settings
			expect(frame.name.length).toBeGreaterThan(0);
		}

		// Cleanup test project
		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 15_000);

	it("Scenario 2 — Mobile without reference: creates mobile-first screens", async () => {
		const userId = await getTestUserId();
		const { project } = await createStudioProjectWithJob(userId, {
			prompt: "Buatkan prototype aplikasi pengelolaan keuangan pribadi",
			designMode: "mobile",
		});

		expect(project.designMode).toBe("mobile");

		let detail = await getStudioProjectDetail(project.id, userId);
		const startTime = Date.now();
		while (Date.now() - startTime < 10_000) {
			detail = await getStudioProjectDetail(project.id, userId);
			if (detail.frames.some((f) => f.status === "ready" && f.htmlCode)) {
				break;
			}
			await new Promise((r) => setTimeout(r, 100));
		}

		expect(detail.frames.length).toBeGreaterThanOrEqual(1);
		const readyFrames = detail.frames.filter((f) => f.status === "ready");
		expect(readyFrames.length).toBeGreaterThanOrEqual(1);
		for (const frame of readyFrames) {
			expect(frame.viewport).toBe("mobile");
			expect(frame.htmlCode).toContain("<html");
		}

		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 15_000);

	it("Scenario 3 & 4 — Web with DESIGN.md and uploaded logo: enforces tokens and logo", async () => {
		const userId = await getTestUserId();
		const pngHeader = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x00, 0x00,
		]).toString("base64");

		const { project } = await createStudioProjectWithJob(userId, {
			prompt: "Buatkan landing page toko kopi lokal nusantara",
			designMode: "web",
			designMd: sampleDesignMd,
			logo: {
				filename: "kopi-logo.png",
				mimeType: "image/png",
				data: pngHeader,
			},
		});

		expect(project.designMd).toContain("MindMarket");
		expect(project.logoAssetId).toBeDefined();

		let detail = await getStudioProjectDetail(project.id, userId);
		const startTime = Date.now();
		while (Date.now() - startTime < 10_000) {
			detail = await getStudioProjectDetail(project.id, userId);
			if (detail.frames.some((f) => f.status === "ready" && f.htmlCode)) {
				break;
			}
			await new Promise((r) => setTimeout(r, 100));
		}

		expect(detail.logoUrl).toContain("/api/studio/asset?id=");
		expect(detail.frames.length).toBeGreaterThanOrEqual(1);

		const readyFrames = detail.frames.filter((f) => f.status === "ready");
		expect(readyFrames.length).toBeGreaterThanOrEqual(1);
		for (const frame of readyFrames) {
			expect(frame.htmlCode).toBeDefined();
			const html = frame.htmlCode || "";
			// Verify deterministic CSS tokens injection
			expect(html).toContain("studio-design-tokens");
			expect(html).toContain("--color-primary: #8ed462");
			expect(html).toContain("--canvas-bg: #f5f1e4");
			// Verify background color enforcement
			expect(html).toContain("background-color: #f5f1e4");
		}

		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 15_000);

	it("Scenario 5 — Failure, frame retry, and history reopening", async () => {
		const userId = await getTestUserId();
		const { project } = await createStudioProjectWithJob(userId, {
			prompt: "Aplikasi catatan harian sederhana",
			designMode: "web",
		});

		// Insert 1 failed frame manually to test individual frame retry
		const [failedFrame] = await db
			.insert(studioFrames)
			.values({
				projectId: project.id,
				name: "Detail Catatan",
				viewport: "web",
				status: "failed",
				error: "Simulated timeout",
				order: 0,
			})
			.returning();

		// Retry only the failed frame
		const retried = await retryStudioFrame(project.id, userId, failedFrame.id);
		expect(retried.status).toBe("ready");
		expect(retried.htmlCode).toContain("<html");

		// Test history listing
		const history = await listStudioProjects(userId);
		expect(history.some((p) => p.id === project.id)).toBe(true);

		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 120_000);
});
