import { describe, expect, it } from "vitest";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioMessageRow,
} from "@/db/schema";
import { composeStudioAssistantContent } from "../services/studio-conversation-content";
import { resolveStudioMessageProgress } from "../services/studio-conversation-progress";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { extractStudioFrameFacts } from "../services/studio-frame-facts";
import type {
	StudioMessageFrame,
	StudioMessageProgress,
} from "../types/studio-conversation";

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Jelajahin",
		targetAudience: "pelancong domestik",
		platform: "mobile",
		visualDirection: "Hangat dan editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Bottom tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["jelajah", "profil"],
		labels: ["Jelajah", "Profil"],
		iconMapping: {},
		ordering: ["jelajah", "profil"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{
			name: "Jelajah",
			role: "Cari destinasi",
			order: 0,
			navigationRole: "primary",
			destinationId: "jelajah",
		},
		{
			name: "Profil",
			role: "Kelola data pemesan",
			order: 1,
			navigationRole: "primary",
			destinationId: "profil",
		},
	],
};

const profileHtml =
	'<body><nav><a href="#">Jelajah</a><a href="#">Profil</a></nav><h1>Data Pemesan</h1><form><label>Nama lengkap</label><input><button>Simpan</button></form></body>';
const plainHtml = "<body><h1>Beranda</h1><p>Teks biasa</p></body>";

function shown(
	frameId: string,
	name: string,
	html: string,
	over: Partial<StudioMessageFrame> = {},
): StudioMessageFrame {
	return {
		frameId,
		name,
		viewport: "web",
		status: "ready",
		revision: 1,
		facts: extractStudioFrameFacts(html),
		...over,
	};
}

function progress(over: Partial<StudioMessageProgress>): StudioMessageProgress {
	return {
		phase: "completed",
		ready: 1,
		total: 1,
		failed: 0,
		kind: "add",
		screenNames: ["Profil"],
		recovery: null,
		frames: [shown("f1", "Profil", profileHtml)],
		...over,
	};
}

const compose = (p: StudioMessageProgress, request = "") =>
	composeStudioAssistantContent({ progress: p, blueprint, request });

describe("grounded assistant explanation", () => {
	it("explains an added screen from its plan entry and the controls its HTML contains", () => {
		const content = compose(progress({}), "Tambahkan layar Profil.");
		expect(content).toContain("**Profil**");
		expect(content).toContain("Kelola data pemesan");
		expect(content).toContain("“Data Pemesan”");
		expect(content).toContain("“Nama lengkap”");
		expect(content).toContain("“Simpan”");
		expect(content).toContain("navigasi utama bersama **Jelajah**");
	});

	it("never claims a control or limitation the screen does not carry", () => {
		const content = compose(
			progress({ frames: [shown("f1", "Profil", plainHtml)] }),
		);
		expect(content).not.toContain("Nama lengkap");
		expect(content).not.toContain("Tombol");
		expect(content).not.toContain("formulir");
		expect(content).not.toContain("prototipe");
	});

	it("states what the mock prototype does not do only when forms or actions exist", () => {
		const content = compose(progress({}));
		expect(content).toContain("Autentikasi, penyimpanan data, pembayaran");
	});

	it("never invents research, publication, payment or delivery success", () => {
		const everything = [
			compose(progress({})),
			compose(progress({ kind: "initial", screenNames: ["Profil"] })),
			compose(progress({ kind: "revise" }), "Ubah tombol"),
		].join("\n");
		for (const claim of [
			/riset|research|kompetitor|competitor|benchmark/i,
			/stripe|wise|zoho/i,
			/dipublikasi|published|di-deploy|deployed/i,
			/transfer (?:bank )?(?:berhasil|dilakukan)/i,
			/email (?:telah |sudah )?terkirim/i,
		])
			expect(everything).not.toMatch(claim);
	});

	it("is silent about status: no template the old job reporting used", () => {
		for (const phase of ["queued", "planning", "generating"] as const) {
			const content = compose(
				progress({
					phase,
					ready: 0,
					frames: [
						shown("f1", "Profil", "", { status: "pending", facts: undefined }),
					],
				}),
			);
			expect(content).toBe("");
		}
		const all = [
			compose(progress({})),
			compose(progress({ kind: "initial" })),
			compose(progress({ kind: "revise" })),
		].join("\n");
		for (const old of [
			/Rencana layar/,
			/selesai diproses/,
			/Revisi diterapkan/,
			/halaman dibuat/,
		])
			expect(all).not.toMatch(old);
	});

	it("describes a multi-screen initial plan by purpose and navigation, without repeating one template", () => {
		const content = compose(
			progress({
				kind: "initial",
				ready: 2,
				total: 2,
				screenNames: ["Jelajah", "Profil"],
				frames: [
					shown("a", "Jelajah", plainHtml),
					shown("b", "Profil", profileHtml),
				],
			}),
		);
		expect(content).toContain(
			"**Jelajahin** dirancang untuk pelancong domestik",
		);
		expect(content).toContain("Cari destinasi");
		expect(content).toContain("Kelola data pemesan");
		expect(content).toContain(
			"Navigasi utama menghubungkan **Jelajah**, **Profil**",
		);
	});

	it("names the screens that failed and does not describe their unseen content", () => {
		const content = compose(
			progress({
				kind: "initial",
				phase: "partial",
				ready: 1,
				total: 2,
				failed: 1,
				recovery: "frames",
				failedScreens: ["Profil"],
				screenNames: ["Jelajah", "Profil"],
				frames: [
					shown("a", "Jelajah", plainHtml),
					{
						frameId: "b",
						name: "Profil",
						viewport: "web",
						status: "failed",
						revision: 0,
					},
				],
			}),
		);
		expect(content).toContain("**Profil** belum berhasil diproses");
		expect(content).not.toContain("Kelola data pemesan");
	});

	it("keeps a total failure honest and free of any invented plan", () => {
		const content = compose(
			progress({
				phase: "failed",
				ready: 0,
				total: 0,
				kind: "initial",
				screenNames: [],
				frames: undefined,
				recovery: "planning",
			}),
		);
		expect(content).toContain("belum berhasil");
		expect(content).not.toContain("Jelajah");
	});

	it("reports a revision from what actually changed between the two committed revisions", () => {
		const base = {
			kind: "revise" as const,
			screenNames: ["Profil"],
		};
		const changed = compose(
			progress({
				...base,
				frames: [
					shown("f1", "Profil", profileHtml, {
						revision: 3,
						changes: {
							kind: "text",
							added: ["Simpan Perubahan"],
							removed: ["Simpan"],
						},
					}),
				],
			}),
			"Ubah label tombol",
		);
		expect(changed).toContain("“Simpan Perubahan”");
		expect(changed).toContain("“Simpan”");
		const identical = compose(
			progress({
				...base,
				frames: [
					shown("f1", "Profil", profileHtml, {
						changes: { kind: "identical", added: [], removed: [] },
					}),
				],
			}),
		);
		expect(identical).toContain("identik");
		const unknown = compose(progress({ ...base }));
		expect(unknown).toContain("tidak dapat dirinci");
		expect(new Set([changed, identical, unknown]).size).toBe(3);
	});

	it("neutralises Markdown, links and HTML carried by user, plan or screen text", () => {
		const hostile: StudioDesignBlueprint = {
			...blueprint,
			productIdentity: {
				...blueprint.productIdentity,
				productName:
					"<script>x</script>[a](javascript:alert(1)) https://evil.test",
			},
		};
		const htmlWithHostileText =
			"<body><h1>[klik](javascript:alert(1)) **tebal**</h1><button>`kode` https://evil.test</button></body>";
		const content = composeStudioAssistantContent({
			progress: progress({
				frames: [shown("f1", "Profil", htmlWithHostileText)],
			}),
			blueprint: hostile,
			request: "# judul\n<img src=x onerror=1> [x](javascript:alert(1))",
		});
		expect(content).not.toMatch(/<|\]\(|`|https?:/);
		expect(content).not.toContain("javascript:alert(1)](");
	});

	it("stays proportional: a single screen is not padded with generic design advice", () => {
		const single = compose(
			progress({ frames: [shown("f1", "Profil", plainHtml)] }),
		);
		expect(single.split("\n\n").length).toBeLessThanOrEqual(3);
		expect(single.length).toBeLessThan(600);
	});

	it("is deterministic for the same persisted facts", () => {
		const input = progress({});
		expect(compose(input)).toBe(compose(input));
	});
});

describe("frame results scoped to one operation", () => {
	const now = new Date("2026-01-01");
	const frame = (
		id: string,
		name: string,
		over: Partial<StudioFrameRow> = {},
	): StudioFrameRow => ({
		id,
		projectId: "p",
		name,
		description: null,
		viewport: "web",
		htmlCode: "<body><h1>Profil</h1></body>",
		status: "ready",
		order: 0,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		originJobId: null,
		initialSlot: null,
		revision: 1,
		lastJobId: null,
		createdAt: now,
		updatedAt: now,
		...over,
	});
	const job = (id: string, over: Partial<StudioJobRow> = {}): StudioJobRow => ({
		id,
		projectId: "p",
		userId: "u",
		prompt: "x",
		jobType: "add",
		targetFrameId: null,
		status: "completed",
		error: null,
		claimedBy: null,
		requestId: null,
		requestHash: null,
		operationIntent: null,
		operationIndex: null,
		blueprintJobId: null,
		dependsOnJobId: null,
		baseRevision: 0,
		planningCompletedAt: null,
		errorCode: null,
		attempts: 0,
		claimedAt: null,
		leaseExpiresAt: null,
		startedAt: null,
		finishedAt: null,
		deletedAt: null,
		creditOperationId: null,
		createdAt: now,
		updatedAt: now,
		...over,
	});
	const message = (
		jobIds: string[],
		prior: StudioMessageProgress | null = null,
	): StudioMessageRow => ({
		id: "m",
		projectId: "p",
		userId: "u",
		operationId: "op",
		jobIds,
		role: "assistant",
		content: "",
		order: 1,
		status: "queued",
		attachments: [],
		progress: prior,
		createdAt: now,
		updatedAt: now,
	});

	it("attaches only the frame the add job created, never another operation's frames", () => {
		const result = resolveStudioMessageProgress(
			message(["j2"]),
			[job("j1"), job("j2", { targetFrameId: "new" })],
			[frame("old", "Jelajah"), frame("new", "Profil")],
		);
		expect(result.frames?.map((entry) => entry.frameId)).toEqual(["new"]);
		expect(result.frames?.[0].status).toBe("ready");
	});

	it("pins a ready frame's facts so a later canvas edit or worker tick cannot rewrite the turn", () => {
		const first = resolveStudioMessageProgress(
			message(["j2"]),
			[job("j2", { targetFrameId: "new" })],
			[frame("new", "Profil")],
		);
		const edited = resolveStudioMessageProgress(
			message(["j2"], first),
			[job("j2", { targetFrameId: "new" })],
			[
				frame("new", "Profil", {
					revision: 4,
					htmlCode: "<body><h1>Sudah diganti</h1></body>",
				}),
			],
		);
		expect(edited.frames).toEqual(first.frames);
		expect(JSON.stringify(edited)).not.toContain("Sudah diganti");
	});

	it("does not duplicate a frame when an add and its retry target the same frame", () => {
		const result = resolveStudioMessageProgress(
			message(["j2", "j3"]),
			[
				job("j2", { targetFrameId: "new", status: "failed" }),
				job("j3", {
					targetFrameId: "new",
					jobType: "add",
					createdAt: new Date("2026-01-02"),
				}),
			],
			[frame("new", "Profil")],
		);
		expect(result.frames).toHaveLength(1);
	});

	it("reports a queued add as pending with a neutral name, not as a result", () => {
		const result = resolveStudioMessageProgress(
			message(["j2"]),
			[job("j2", { targetFrameId: "new", status: "queued" })],
			[
				frame("new", "Menamai layar baru...", {
					htmlCode: null,
					status: "queued",
					revision: 0,
				}),
			],
		);
		expect(result.frames?.[0]).toMatchObject({
			status: "pending",
			name: "Layar baru",
		});
		expect(
			composeStudioAssistantContent({
				progress: result,
				blueprint,
				request: "",
			}),
		).toBe("");
	});

	it("keeps a failed revision failed and never claims its change", () => {
		const result = resolveStudioMessageProgress(
			message(["j2"]),
			[
				job("j2", {
					jobType: "revise",
					targetFrameId: "f",
					status: "failed",
					baseRevision: 1,
				}),
			],
			[frame("f", "Profil")],
		);
		expect(result.frames?.[0].status).toBe("failed");
		expect(result.frames?.[0].changes).toBeUndefined();
	});
});
