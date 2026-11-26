import { JSDOM } from "jsdom";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import { GET } from "@/routes/api/studio.frame";
import { exportProjectAsZip } from "../services/studio-export";
import { portfolioBlueprint } from "./fixtures/studio-evaluation-fixtures";

const CHANNEL = "11111111-1111-4111-8111-111111111111";
const OWNER = "user-owner";

const state = vi.hoisted(() => ({
	userId: "user-owner",
	project: null as Record<string, unknown> | null,
	frames: [] as Record<string, unknown>[],
	tables: [] as string[],
}));

vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: state.userId }),
}));
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
// A mock factory is hoisted above static imports, so the table-name helper
// has to be loaded lazily inside it.
vi.mock("@/db", async () => {
	const { getTableName } = await import("drizzle-orm");
	return {
		db: {
			select: () => {
				// A real Promise carrying the chain methods: awaitable at any step.
				const result = (rows: Record<string, unknown>[]) =>
					Object.assign(Promise.resolve(rows), {
						orderBy: () => result(rows),
						limit: () => result(rows),
					});
				return {
					from: (table: Parameters<typeof getTableName>[0]) => {
						const name = getTableName(table);
						state.tables.push(name);
						const rows =
							name === "studio_projects"
								? state.project && state.project.userId === state.userId
									? [state.project]
									: []
								: name === "studio_frames"
									? state.frames
									: [];
						return { where: () => result(rows) };
					},
				};
			},
			insert: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		},
	};
});

const frameRow = (id: string, name: string, htmlCode: string | null) => ({
	id,
	projectId: "p1",
	name,
	description: null,
	viewport: "web",
	htmlCode,
	status: htmlCode ? "ready" : "queued",
	order: Number(id.slice(1)),
	revision: 3,
});

const HTML = `<!doctype html><html><head><title>t</title><script>window.stolen=1</script></head><body>
<main data-studio-content>
<a href="#" data-proto-action="navigate" data-proto-target="Pemesanan" onclick="steal()">Pesan</a>
<a href="javascript:alert(1)">bad</a>
<img src="/api/studio/asset?id=missing" alt="x">
<form action="https://evil.test/post"><input name="nama"><button type="submit">Kirim</button></form>
<iframe src="https://evil.test"></iframe>
</main></body></html>`;

beforeEach(() => {
	state.userId = OWNER;
	state.tables = [];
	state.project = {
		id: "p1",
		userId: OWNER,
		title: "Jelajahin",
		designMd: null,
		designBlueprint: null,
	};
	state.frames = [
		frameRow("f1", "Jelajah", HTML),
		frameRow("f2", "Pemesanan", "<html><body><main>Form</main></body></html>"),
	];
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const request = (frameId: string, extra = "") =>
	GET({
		request: new Request(
			`https://app.test/api/studio/frame?prototype=1&projectId=p1&frameId=${frameId}&channel=${CHANNEL}${extra}`,
		),
	});

describe("P10 prototype document endpoint", () => {
	it("returns an isolated document with a validated manifest and the real page list", async () => {
		const response = await request("f1");
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({
			projectId: "p1",
			frameId: "f1",
			baseRevision: 3,
			channel: CHANNEL,
			interactionCount: 1,
		});
		expect(body.screens.map((screen: { id: string }) => screen.id)).toEqual([
			"f1",
			"f2",
		]);
		const doc = new JSDOM(body.html).window.document;
		const scripts = [...doc.querySelectorAll("script")];
		expect(scripts).toHaveLength(1);
		expect(scripts[0]?.getAttribute("nonce")).toBe(CHANNEL);
		expect(body.html).not.toContain("window.stolen");
		expect(body.html).not.toContain("steal()");
		expect(doc.querySelector("iframe")).toBeNull();
		expect(doc.querySelector("form")?.getAttribute("action")).toBeNull();
		expect(doc.querySelector('a[href^="javascript"]')).toBeNull();
		expect(doc.querySelector("[data-ev-ix]")?.getAttribute("data-ev-ix")).toBe(
			"ix-1",
		);
		const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
		expect(csp?.getAttribute("content")).toContain("connect-src 'none'");
		expect(csp?.getAttribute("content")).toContain("form-action 'none'");
		expect(csp?.getAttribute("content")).toContain(
			`script-src 'nonce-${CHANNEL}'`,
		);
		expect(body.unresolvedAssets).toBe(1);
	});

	it("never exposes another user's project: it reads as not found", async () => {
		state.userId = "user-intruder";
		const response = await request("f1");
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: "STUDIO_NOT_FOUND" });
	});

	it("rejects a frame that is not ready, deleted, or not in the project", async () => {
		state.frames = [
			frameRow("f1", "Jelajah", HTML),
			frameRow("f2", "Kosong", null),
		];
		expect((await request("f2")).status).toBe(404);
		expect((await request("ghost")).status).toBe(404);
	});

	it("rejects an invalid channel or missing identity before touching data", async () => {
		const bad = await GET({
			request: new Request(
				"https://app.test/api/studio/frame?prototype=1&projectId=p1&frameId=f1&channel=not-a-uuid",
			),
		});
		expect(bad.status).toBe(400);
		expect(state.tables).toEqual([]);
	});

	it("reflects a revision change and a deleted page on the next load", async () => {
		const before = await (await request("f1")).json();
		state.frames = [
			{
				...frameRow("f1", "Jelajah", HTML.replace("Pesan", "Pesan sekarang")),
				revision: 4,
			},
		];
		const after = await (await request("f1")).json();
		expect(after.baseRevision).toBe(4);
		expect(after.html).toContain("Pesan sekarang");
		expect(after.screens.map((screen: { id: string }) => screen.id)).toEqual([
			"f1",
		]);
		// The link survives as an honest "unavailable" navigation, never a silent success.
		expect(after.interactionCount).toBe(1);
		expect(
			new JSDOM(after.html).window.document.querySelector("[data-ev-ix]"),
		).not.toBeNull();
		expect(after.issues.map((issue: { code: string }) => issue.code)).toContain(
			"UNKNOWN_SCREEN",
		);
		expect(before.interactionCount).toBe(1);
	});

	it("keeps a legacy static frame viewable and says what is not interactive", async () => {
		state.frames = [
			frameRow(
				"f1",
				"Lama",
				'<!doctype html><html><body><main><a href="#">Detail</a><h1>Halo</h1></main></body></html>',
			),
		];
		const body = await (await request("f1")).json();
		expect(body.interactionCount).toBe(0);
		expect(body.inertLinks).toBe(1);
		expect(body.html).toContain("Halo");
	});

	it("repairs a model-authored search field before the viewer isolates it", async () => {
		state.project = {
			...state.project,
			designBlueprint: {
				...portfolioBlueprint,
				compositionOwner: "model",
			},
		};
		state.frames = [
			frameRow(
				"f1",
				"Jelajah",
				'<!doctype html><html><body><main><input type="search" aria-label="Cari tujuan" disabled></main></body></html>',
			),
		];
		const body = await (await request("f1")).json();
		const input = new JSDOM(body.html).window.document.querySelector(
			'input[type="search"]',
		);
		expect(input?.id).toBe("studio-search-1");
		expect(input?.getAttribute("name")).toBe("studio-search-1");
	});

	it("is read-only: no write, job, credit or generation path is touched", async () => {
		const { db } = await import("@/db");
		await request("f1");
		for (const method of [db.insert, db.update, db.delete, db.transaction])
			expect(method).not.toHaveBeenCalled();
	});
});

const exportFrame = (htmlCode: string): StudioFrameRow => ({
	id: "f1",
	projectId: "p1",
	name: "Jelajah",
	description: null,
	viewport: "web",
	htmlCode,
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
	createdAt: new Date(0),
	updatedAt: new Date(0),
});

describe("P10 export cleanliness", () => {
	const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
		url: "https://studio.test",
	});
	dom.window.document.addEventListener("click", (event) =>
		event.preventDefault(),
	);
	beforeEach(() => {
		vi.stubGlobal("document", dom.window.document);
		vi.stubGlobal("setTimeout", vi.fn());
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
	});
	afterEach(() => vi.unstubAllGlobals());

	it("ships committed HTML only, with no runtime, and states the limit in the manifest", async () => {
		const committed =
			'<!doctype html><html><body><main><a data-proto-action="navigate" data-proto-target="Pemesanan" href="#">Pesan</a></main></body></html>';
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ html: committed, viewport: "web" })),
		);
		await exportProjectAsZip("Project", "p1", [exportFrame(committed)]);
		const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0];
		if (!(blob instanceof Blob)) throw new Error("ZIP missing");
		const zip = await JSZip.loadAsync(await blob.arrayBuffer());
		const shipped = (await zip.file("index.html")?.async("string")) ?? "";
		expect(shipped).toBe(committed);
		for (const marker of ["data-ev-ix", "proto:init", "nonce=", "<script"])
			expect(shipped).not.toContain(marker);
		const manifest = JSON.parse(
			(await zip.file("project-manifest.json")?.async("string")) ?? "{}",
		);
		expect(manifest.interactivity).toMatchObject({ prototypeRuntime: false });
		expect(manifest.interactivity.note).toContain("penampil prototipe");
	});
});
