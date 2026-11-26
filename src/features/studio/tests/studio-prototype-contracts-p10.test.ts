import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractStudioPrototypeManifest } from "../services/studio-prototype-manifest";
import {
	deriveStudioPrototypeScreens,
	resolveStudioPrototypeTarget,
} from "../services/studio-prototype-screens";
import { resolveStudioPreviewReturn } from "../types/studio-preview-contract";
import {
	STUDIO_PROTOTYPE_LIMITS,
	studioPrototypeInteractionSchema,
	studioPrototypeMessageSchema,
	studioPrototypeStateSchema,
} from "../types/studio-prototype";
import { acceptStudioPrototypeMessage } from "../utils/studio-prototype-bridge";
import {
	createStudioPrototypeSession,
	reduceStudioPrototypeSession,
} from "../utils/studio-prototype-session";
import { computeStudioPrototypeStage } from "../utils/studio-prototype-stage";

const frames = [
	{ id: "f1", name: "Jelajah", status: "ready", htmlCode: "<p/>", order: 0 },
	{
		id: "f2",
		name: "Detail Paket",
		status: "ready",
		htmlCode: "<p/>",
		order: 1,
	},
	{ id: "f3", name: "Pemesanan", status: "ready", htmlCode: "<p/>", order: 2 },
	{ id: "f4", name: "Tiket Saya", status: "queued", htmlCode: null, order: 3 },
] as const;
const screens = deriveStudioPrototypeScreens(frames, null);
const CHANNEL = "11111111-1111-4111-8111-111111111111";

function manifest(body: string) {
	const dom = new JSDOM(`<!doctype html><body>${body}</body>`);
	const result = extractStudioPrototypeManifest(dom.window.document, {
		screens,
	});
	return { ...result, document: dom.window.document };
}

describe("P10 screen identity", () => {
	it("lists only ready frames with stable ids and unique routes", () => {
		expect(screens.map((screen) => screen.id)).toEqual(["f1", "f2", "f3"]);
		expect(new Set(screens.map((screen) => screen.route)).size).toBe(3);
		expect(screens[1]?.route).toBe("/detail-paket");
	});

	it("resolves by id, route and name, and never guesses an unknown page", () => {
		expect(resolveStudioPrototypeTarget("f2", screens).screenId).toBe("f2");
		expect(resolveStudioPrototypeTarget("/pemesanan", screens).screenId).toBe(
			"f3",
		);
		expect(resolveStudioPrototypeTarget("Detail Paket", screens).screenId).toBe(
			"f2",
		);
		expect(resolveStudioPrototypeTarget("Tiket Saya", screens).screenId).toBe(
			null,
		);
		expect(resolveStudioPrototypeTarget("", screens).screenId).toBe(null);
	});
});

describe("P10 interaction manifest", () => {
	it("accepts only the closed action set with bounded parameters", () => {
		expect(
			studioPrototypeInteractionSchema.safeParse({
				ix: "ix-1",
				type: "eval",
				code: "alert(1)",
			}).success,
		).toBe(false);
		expect(
			studioPrototypeInteractionSchema.safeParse({
				ix: "ix-1",
				type: "show_feedback",
				message: "x".repeat(STUDIO_PROTOTYPE_LIMITS.messageChars + 1),
				tone: "info",
			}).success,
		).toBe(false);
		expect(studioPrototypeStateSchema.safeParse({ Bad_Key: 1 }).success).toBe(
			false,
		);
		expect(
			studioPrototypeStateSchema.safeParse({
				a: "x".repeat(STUDIO_PROTOTYPE_LIMITS.stateValueChars + 1),
			}).success,
		).toBe(false);
	});

	it("registers declared navigation, dialogs, tabs, forms and filters", () => {
		const { interactions, issues } = manifest(`
			<a href="#" data-proto-action="navigate" data-proto-target="Detail Paket">Lihat</a>
			<button data-proto-action="open_dialog" data-proto-target="tolak">Tolak</button>
			<div data-proto-dialog="tolak" hidden></div>
			<button data-proto-action="select_tab" data-proto-tab-group="g" data-proto-tab="a">A</button>
			<div data-proto-tab-panel="a" data-proto-tab-group="g"></div>
			<form data-proto-form="pesan"><input required name="nama"></form>
			<button data-proto-action="submit_mock_form" data-proto-target="pesan" data-proto-success="Pemesanan">Kirim</button>
			<div data-proto-collection="paket"></div>
			<input data-proto-action="filter_collection" data-proto-target="paket">
		`);
		expect(Object.values(interactions).map((entry) => entry.type)).toEqual([
			"navigate",
			"open_dialog",
			"select_tab",
			"submit_mock_form",
			"filter_collection",
		]);
		expect(issues.filter((issue) => issue.code !== "SENSITIVE_FIELD")).toEqual(
			[],
		);
	});

	it("drops unknown actions and reports them instead of executing", () => {
		const { interactions, issues } = manifest(
			'<button data-proto-action="run_script" data-proto-target="x">x</button>',
		);
		expect(Object.keys(interactions)).toEqual([]);
		expect(issues[0]?.code).toBe("UNKNOWN_ACTION");
	});

	it("reconciles a deleted target element: no manifest entry points at it", () => {
		const withDialog = `<button data-proto-action="open_dialog" data-proto-target="d">Buka</button>`;
		expect(
			Object.keys(
				manifest(`${withDialog}<div data-proto-dialog="d" hidden></div>`)
					.interactions,
			),
		).toHaveLength(1);
		const deleted = manifest(withDialog);
		expect(Object.keys(deleted.interactions)).toEqual([]);
		expect(deleted.issues.map((issue) => issue.code)).toContain(
			"MISSING_TARGET_ELEMENT",
		);
	});

	it("keeps a link to a nonexistent page honest instead of pretending it works", () => {
		const { interactions, issues } = manifest(
			'<a data-proto-action="navigate" data-proto-target="Halaman Hantu">x</a>',
		);
		expect(Object.values(interactions)[0]).toMatchObject({
			type: "navigate",
			screenId: null,
		});
		expect(issues.map((issue) => issue.code)).toContain("UNKNOWN_SCREEN");
	});

	it("maps legacy canonical navigation without any declaration", () => {
		const { interactions, legacyMapped, inertLinks } = manifest(`
			<nav data-studio-navigation>
				<a href="#" data-destination="detail-paket" aria-current="page">Detail</a>
				<a href="#jelajah">Jelajah</a>
				<a href="#">Mati</a>
			</nav>`);
		expect(legacyMapped).toBe(2);
		expect(Object.values(interactions).map((entry) => entry.type)).toEqual([
			"navigate",
			"navigate",
		]);
		expect(inertLinks).toBe(1);
	});

	it("never trusts markers the stored HTML already carries", () => {
		const { interactions } = manifest(
			'<button data-ev-ix="ix-99">fake</button>',
		);
		expect(interactions["ix-99"]).toBeUndefined();
	});

	it("flags sensitive fields so the runtime never keeps their values", () => {
		const { document, issues } = manifest(
			'<input type="password" name="pw"><input name="card-number"><input name="nama">',
		);
		expect(document.querySelectorAll("[data-ev-sensitive]")).toHaveLength(2);
		expect(issues.some((issue) => issue.code === "SENSITIVE_FIELD")).toBe(true);
	});

	it("bounds the manifest size", () => {
		const links = Array.from(
			{ length: STUDIO_PROTOTYPE_LIMITS.interactions + 20 },
			() =>
				'<button data-proto-action="show_feedback" data-proto-message="ok">x</button>',
		).join("");
		expect(Object.keys(manifest(links).interactions)).toHaveLength(
			STUDIO_PROTOTYPE_LIMITS.interactions,
		);
	});
});

describe("P10 prototype session", () => {
	const reduce = (
		session: ReturnType<typeof createStudioPrototypeSession>,
		action: Parameters<typeof reduceStudioPrototypeSession>[1],
		list = screens,
	) => reduceStudioPrototypeSession(session, action, list);

	it("starts on the requested frame and falls back to the first real page", () => {
		expect(createStudioPrototypeSession(screens, "f2").currentId).toBe("f2");
		expect(createStudioPrototypeSession(screens, "ghost").currentId).toBe("f1");
		expect(createStudioPrototypeSession([], "f2").currentId).toBeNull();
	});

	it("navigates, keeps prototype-local history and goes back", () => {
		let session = createStudioPrototypeSession(screens, "f1");
		session = reduce(session, { type: "go", screenId: "f2" });
		session = reduce(session, { type: "go", screenId: "f3" });
		expect(session.currentId).toBe("f3");
		session = reduce(session, { type: "back" });
		expect(session.currentId).toBe("f2");
		session = reduce(session, { type: "back" });
		expect(session.currentId).toBe("f1");
		session = reduce(session, { type: "back" });
		expect(session.currentId).toBe("f1");
		expect(session.notice).toBeTruthy();
	});

	it("reports an unavailable page and stays put", () => {
		const session = reduce(createStudioPrototypeSession(screens, "f1"), {
			type: "go",
			screenId: null,
			requested: "Tiket Saya",
		});
		expect(session.currentId).toBe("f1");
		expect(session.notice).toContain("Tiket Saya");
	});

	it("shares mock state across pages and resets it on refresh", () => {
		let session = createStudioPrototypeSession(screens, "f1");
		session = reduce(session, { type: "state", state: { metode: "qris" } });
		session = reduce(session, { type: "go", screenId: "f3" });
		expect(session.state).toEqual({ metode: "qris" });
		const before = session.refresh;
		session = reduce(session, { type: "reset" });
		expect(session.state).toEqual({});
		expect(session.refresh).toBe(before + 1);
		expect(session.currentId).toBe("f3");
	});

	it("handles a removed screen by landing on a real page", () => {
		let session = createStudioPrototypeSession(screens, "f2");
		session = reduce(session, { type: "go", screenId: "f3" });
		const remaining = screens.filter((screen) => screen.id !== "f3");
		session = reduce(session, { type: "sync", screens: remaining }, remaining);
		expect(session.currentId).toBe("f1");
		expect(session.history).not.toContain("f3");
		expect(session.notice).toBeTruthy();
	});

	it("rejects out-of-bounds state", () => {
		const session = reduce(createStudioPrototypeSession(screens, "f1"), {
			type: "state",
			state: { k: "x".repeat(5000) },
		});
		expect(session.state).toEqual({});
	});
});

describe("P10 bridge acceptance", () => {
	const source = {};
	const message = {
		type: "proto:navigate",
		channel: CHANNEL,
		screenId: "f1",
		target: { screenId: "f2", requested: "Detail" },
	};
	const expected = { channel: CHANNEL, screenId: "f1", source };

	it("accepts a validated message from the owned window only", () => {
		expect(
			acceptStudioPrototypeMessage(
				{ source, origin: "null", data: message },
				expected,
			),
		).toMatchObject({ type: "proto:navigate" });
		expect(
			acceptStudioPrototypeMessage(
				{ source: {}, origin: "null", data: message },
				expected,
			),
		).toBeNull();
		expect(
			acceptStudioPrototypeMessage(
				{ source, origin: "https://evil.test", data: message },
				expected,
			),
		).toBeNull();
	});

	it("drops wrong channel, wrong screen, unknown commands and extra keys", () => {
		for (const data of [
			{ ...message, channel: "22222222-2222-4222-8222-222222222222" },
			{ ...message, screenId: "f9" },
			{ ...message, type: "proto:eval", code: "1" },
			{ ...message, extra: true },
		])
			expect(
				acceptStudioPrototypeMessage(
					{ source, origin: "null", data },
					expected,
				),
			).toBeNull();
		expect(
			studioPrototypeMessageSchema.safeParse({
				type: "proto:state",
				channel: CHANNEL,
				screenId: "f1",
				state: { a: { nested: true } },
			}).success,
		).toBe(false);
	});
});

describe("P10 stage and return path", () => {
	it("keeps the real device viewport and only scales the shell down", () => {
		const roomy = computeStudioPrototypeStage("mobile", {
			width: 1200,
			height: 2000,
		});
		expect(roomy.viewport).toEqual({ width: 390, height: 844 });
		expect(roomy.scale).toBe(1);
		const tight = computeStudioPrototypeStage("mobile", {
			width: 400,
			height: 500,
		});
		expect(tight.viewport).toEqual({ width: 390, height: 844 });
		expect(tight.scale).toBeLessThan(1);
		expect(tight.footprint.height).toBeLessThanOrEqual(500);
		expect(
			computeStudioPrototypeStage("desktop", { width: 1400, height: 900 })
				.viewport.width,
		).toBe(1440);
	});

	it("lets Back return only to the project's own canvas", () => {
		expect(resolveStudioPreviewReturn("/design/p1", "p1")).toBe("/design/p1");
		expect(resolveStudioPreviewReturn("/design/other", "p1")).toBe(
			"/design/p1",
		);
		expect(resolveStudioPreviewReturn("https://evil.test", "p1")).toBe(
			"/design/p1",
		);
		expect(resolveStudioPreviewReturn(undefined, "p1")).toBe("/design/p1");
	});
});
