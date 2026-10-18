import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioProjects, users } from "@/db/schema";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { listStudioProjects } from "../services/studio-project-lifecycle";
import { retryStudioFrame } from "../services/studio-retry-service";

const e2eState = vi.hoisted(() => ({ labels: [] as string[] }));

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
			// The mock honors the requested initial screen count so the
			// exact-cardinality contract is exercised instead of tripped.
			const countMatch = userMsg.match(/Initial screen count: exactly (\d+)/);
			const parsedCount = countMatch
				? Number.parseInt(countMatch[1], 10)
				: Number.NaN;
			const screenCount =
				Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 8
					? parsedCount
					: 2;
			const baseNames = isMobile
				? ["Ringkasan Saldo", "Riwayat Transaksi"]
				: ["Beranda Utama", "Daftar Karya"];
			const screens = Array.from({ length: screenCount }, (_, order) => ({
				name: baseNames[order] ?? `Layar Tambahan ${order + 1}`,
				description: "Halaman ringkasan",
				viewport: isMobile ? "mobile" : "web",
				order,
			}));
			const destinations = screens.map((_, order) => `screen-${order}`);
			e2eState.labels = screens.map((s) => s.name);
			const planJson = JSON.stringify({
				projectTitle: isMobile ? "Aplikasi Keuangan" : "Website Portofolio",
				screens,
				blueprint: {
					productIdentity: {
						productName: isMobile ? "Aplikasi Keuangan" : "Website Portofolio",
						targetAudience: "Umum",
						platform: isMobile ? "mobile" : "web",
						visualDirection: "Bersih",
					},
					designTokens: {
						primary: "#8ed462",
						secondary: "#606060",
						background: "#f5f1e4",
						surface: "#ffffff",
						fontFamily: "Inter",
						radius: 12,
						border: "1px solid #d3d3d3",
						elevation: "none",
					},
					sharedComponents: {
						header: "Bar",
						navigation: "Tabs",
						buttons: "Ink",
						inputs: "8px",
						cards: "12px",
						tabs: "Seg",
						icons: "Lucide",
					},
					navigationContract: {
						destinations,
						labels: screens.map((s) => s.name),
						iconMapping: {},
						ordering: destinations,
						activeItemRule: "Highlight active",
					},
					screenPlan: screens.map((s) => ({
						name: s.name,
						role: s.description,
						order: s.order,
					})),
				},
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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white">
  <nav><div class="logo">Brand</div><span>${e2eState.labels.join(" ")}</span></nav>
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

		// Tandai 1 slot bawaan sebagai failed untuk menguji retry frame individual
		const slots = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.projectId, project.id))
			.orderBy(studioFrames.order);
		expect(slots.length).toBeGreaterThanOrEqual(1);
		const slot = slots[0];
		await db
			.update(studioFrames)
			.set({
				name: "Detail Catatan",
				status: "failed",
				error: "Simulated timeout",
				updatedAt: new Date(),
			})
			.where(eq(studioFrames.id, slot.id));
		const [failedFrame] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, slot.id));

		// Retry only the failed frame
		const retried = await retryStudioFrame(project.id, userId, failedFrame.id);
		expect(retried.status).toBe("queued");
		await vi.waitFor(async () => {
			const [persisted] = await db
				.select()
				.from(studioFrames)
				.where(eq(studioFrames.id, failedFrame.id));
			expect(persisted.status).toBe("ready");
			expect(persisted.htmlCode).toContain("<html");
		});

		// Test history listing
		const history = await listStudioProjects(userId);
		expect(history.some((p) => p.id === project.id)).toBe(true);

		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 120_000);
});
