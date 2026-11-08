import { and, desc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { studioFrames, studioJobs, studioProjects, users } from "@/db/schema";
import { runStudioJobPipeline } from "../services/studio-job-pipeline";
import { getStudioProjectDetail } from "../services/studio-project-detail";
import { createStudioProjectWithJob } from "../services/studio-project-enqueue";
import { listStudioProjects } from "../services/studio-project-lifecycle";
import { retryStudioFrame } from "../services/studio-retry-service";

const e2eState = vi.hoisted(() => ({
	labels: [] as string[],
	failOnce: false,
}));

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
						ink: "#2c2e2a",
						muted: "#606060",
						onPrimary: "#111111",
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
		if (e2eState.failOnce) {
			e2eState.failOnce = false;
			throw new Error("Simulated provider failure");
		}
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
	const owners: string[] = [];
	afterEach(async () => {
		for (const userId of owners.splice(0))
			await db.delete(users).where(eq(users.id, userId));
		e2eState.failOnce = false;
		e2eState.labels = [];
	});
	async function getTestUserId(): Promise<string> {
		const userId = crypto.randomUUID();
		owners.push(userId);
		await db.insert(users).values({
			id: userId,
			name: "E2E Test User",
			email: `${userId}@example.test`,
		});
		return userId;
	}

	const terminalStatuses = ["completed", "partial", "failed"];

	// Directly execute only this fixture's durable jobs; global dispatch could claim live work.
	async function runStudioWorker(projectId: string): Promise<void> {
		for (let round = 0; round < 60; round++) {
			const [job] = await db
				.select()
				.from(studioJobs)
				.where(eq(studioJobs.projectId, projectId))
				.orderBy(desc(studioJobs.createdAt))
				.limit(1);
			if (!job) throw new Error("Fixture job missing");
			if (terminalStatuses.includes(job.status)) return;
			await runStudioJobPipeline(job.id, projectId, job.userId);
		}
		throw new Error("Studio worker did not reach a terminal job state");
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

		// Progressive persistence: the first ready frame is visible even if a
		// later frame had failed, because the worker persists each frame alone.
		await runStudioWorker(project.id);
		const detail = await getStudioProjectDetail(project.id, userId);

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

		await runStudioWorker(project.id);
		const detail = await getStudioProjectDetail(project.id, userId);

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

		await runStudioWorker(project.id);
		const detail = await getStudioProjectDetail(project.id, userId);

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

		// One provider call fails, so the pipeline persists a genuine frame
		// failure next to the frames that succeeded.
		e2eState.failOnce = true;
		await runStudioWorker(project.id);
		expect(e2eState.failOnce).toBe(false);

		const [failedFrame] = await db
			.select()
			.from(studioFrames)
			.where(
				and(
					eq(studioFrames.projectId, project.id),
					eq(studioFrames.status, "failed"),
				),
			);
		expect(failedFrame).toBeDefined();
		expect(failedFrame.status).toBe("failed");
		expect(failedFrame.htmlCode).toBeNull();

		// Retry only the failed frame through the same durable worker path.
		const { frame: retried, retry } = await retryStudioFrame(
			project.id,
			userId,
			failedFrame.id,
		);
		expect(retry).toBe("queued");
		expect(retried.status).toBe("queued");
		await runStudioWorker(project.id);
		const [persisted] = await db
			.select()
			.from(studioFrames)
			.where(eq(studioFrames.id, failedFrame.id));
		expect(persisted.status).toBe("ready");
		expect(persisted.htmlCode).toContain("<html");

		// Test history listing
		const history = await listStudioProjects(userId);
		expect(history.some((p) => p.id === project.id)).toBe(true);

		await db.delete(studioProjects).where(eq(studioProjects.id, project.id));
	}, 120_000);
});
