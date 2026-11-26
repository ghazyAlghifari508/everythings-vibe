import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractStudioPrototypeManifest } from "../services/studio-prototype-manifest";
import { deriveStudioPrototypeScreens } from "../services/studio-prototype-screens";
import { studioPrototypeRuntimeScript } from "../utils/studio-prototype-runtime";

const CHANNEL = "11111111-1111-4111-8111-111111111111";
const screens = deriveStudioPrototypeScreens(
	[
		{ id: "f1", name: "Jelajah", status: "ready", htmlCode: "<p/>", order: 0 },
		{
			id: "f2",
			name: "Pemesanan",
			status: "ready",
			htmlCode: "<p/>",
			order: 1,
		},
		{
			id: "f3",
			name: "Tiket Saya",
			status: "ready",
			htmlCode: "<p/>",
			order: 2,
		},
	],
	null,
);

const BODY = `
<nav><a href="#" data-proto-action="navigate" data-proto-target="Pemesanan" id="to-pesan">Pesan</a>
<button type="button" data-proto-action="back" id="back">Kembali</button></nav>
<input id="search" data-proto-action="filter_collection" data-proto-target="paket" aria-label="Cari">
<button type="button" id="tag-pantai" data-proto-action="filter_collection" data-proto-target="paket" data-proto-tag="pantai">Pantai</button>
<ul data-proto-collection="paket">
	<li data-proto-item data-proto-tags="pantai">Bali Pantai</li>
	<li data-proto-item data-proto-tags="gunung">Bromo Gunung</li>
	<li data-proto-empty hidden>Tidak ada hasil</li>
</ul>
<button type="button" id="open" data-proto-action="open_dialog" data-proto-target="tolak">Tolak Pengajuan</button>
<div data-proto-dialog="tolak" hidden>
	<form data-proto-form="alasan"><label for="reason">Alasan</label><textarea id="reason" required></textarea>
	<button id="confirm" type="submit" data-proto-action="submit_mock_form" data-proto-target="alasan" data-proto-feedback="Pengajuan ditolak" data-proto-success-key="status" data-proto-success-value="ditolak" data-proto-close-dialog="true">Konfirmasi</button></form>
	<button type="button" id="close" data-proto-action="close_dialog" data-proto-target="tolak">Batal</button>
</div>
<div role="tablist"><button type="button" id="tab-a" data-proto-action="select_tab" data-proto-tab-group="g" data-proto-tab="a">A</button>
<button type="button" id="tab-b" data-proto-action="select_tab" data-proto-tab-group="g" data-proto-tab="b">B</button></div>
<div id="panel-a" data-proto-tab-panel="a" data-proto-tab-group="g">Panel A</div>
<div id="panel-b" data-proto-tab-panel="b" data-proto-tab-group="g" hidden>Panel B</div>
<span id="status" data-proto-bind="status">menunggu</span>
<form data-proto-form="bayar"><label for="nama">Nama</label><input id="nama" required>
<label for="pw">Sandi</label><input id="pw" type="password" data-proto-bind-input="rahasia">
<button id="pay" type="submit" data-proto-action="submit_mock_form" data-proto-target="bayar" data-proto-success="Tiket Saya" data-proto-required-state="metode">Bayar</button></form>
<button type="button" id="method" data-proto-action="set_mock_state" data-proto-state-key="metode" data-proto-state-value="qris">QRIS</button>
<button type="button" id="toggle" data-proto-action="toggle" data-proto-target="faq" aria-label="FAQ">FAQ</button>
<div id="faq" data-proto-region="faq" data-proto-collapsed="true">Jawaban</div>`;

// jsdom exposes DOM constructors on its window; its declared type omits them.
const windowOf = (dom: JSDOM) => dom.window as Window & typeof globalThis;

interface Harness {
	dom: JSDOM;
	sent: Record<string, unknown>[];
	$: (selector: string) => HTMLElement;
	click: (selector: string) => void;
	init: (state?: Record<string, unknown>) => void;
}

function boot(): Harness {
	const dom = new JSDOM(`<!doctype html><body>${BODY}</body>`, {
		runScripts: "outside-only",
		url: "https://app.test/",
	});
	const { document } = dom.window;
	const { interactions } = extractStudioPrototypeManifest(document, {
		screens,
	});
	const sent: Record<string, unknown>[] = [];
	// A real second window plays the parent, so message sources are genuine.
	const parentDom = new JSDOM("<!doctype html><body></body>", {
		url: "https://app.test/",
	});
	parents.push(parentDom);
	const parent = windowOf(parentDom);
	parent.postMessage = ((message: Record<string, unknown>, target: string) => {
		expect(target).toBe("https://app.test");
		sent.push(message);
	}) as typeof parent.postMessage;
	Object.defineProperty(dom.window, "parent", { value: parent });
	windowOf(dom).eval(
		studioPrototypeRuntimeScript({
			channel: CHANNEL,
			screenId: "f1",
			origin: "https://app.test",
			interactions,
		}),
	);
	const $ = (selector: string) => {
		const node = document.querySelector<HTMLElement>(selector);
		if (!node) throw new Error(`missing ${selector}`);
		return node;
	};
	return {
		dom,
		sent,
		$,
		click: (selector) => $(selector).click(),
		init: (state = {}) =>
			windowOf(dom).dispatchEvent(
				new (windowOf(dom).MessageEvent)("message", {
					data: { type: "proto:init", channel: CHANNEL, state },
					source: parent,
				}),
			),
	};
}

const open: JSDOM[] = [];
const parents: JSDOM[] = [];
afterEach(() => {
	for (const dom of [...open.splice(0), ...parents.splice(0)])
		dom.window.close();
	vi.useRealTimers();
});
function start(state?: Record<string, unknown>) {
	const harness = boot();
	open.push(harness.dom);
	harness.init(state);
	return harness;
}

describe("P10 trusted runtime", () => {
	it("navigates by posting a validated target, and goes back through the parent", () => {
		const { click, sent } = start();
		click("#to-pesan");
		expect(sent.at(-1)).toMatchObject({
			type: "proto:navigate",
			channel: CHANNEL,
			screenId: "f1",
			target: { screenId: "f2" },
		});
		click("#back");
		expect(sent.at(-1)).toMatchObject({ type: "proto:back" });
	});

	it("opens and closes a dialog, and validates an empty required reason", () => {
		const { $, click, dom } = start();
		expect($('[data-proto-dialog="tolak"]').hidden).toBe(true);
		click("#open");
		expect($('[data-proto-dialog="tolak"]').hidden).toBe(false);
		click("#confirm");
		expect($("#reason").getAttribute("aria-invalid")).toBe("true");
		expect(dom.window.document.querySelector("[data-ev-error]")).not.toBeNull();
		expect($('[data-proto-dialog="tolak"]').hidden).toBe(false);
		click("#close");
		expect($('[data-proto-dialog="tolak"]').hidden).toBe(true);
	});

	it("applies a valid mock submission to state and closes the dialog", () => {
		vi.useFakeTimers();
		const { $, click, sent } = start();
		click("#open");
		($("#reason") as HTMLTextAreaElement).value = "Dokumen tidak lengkap";
		click("#confirm");
		vi.runAllTimers();
		expect($('[data-proto-dialog="tolak"]').hidden).toBe(true);
		expect($("#status").textContent).toBe("ditolak");
		expect(sent.at(-1)).toMatchObject({
			type: "proto:state",
			state: { status: "ditolak" },
		});
	});

	it("switches tabs and toggles a disclosure", () => {
		const { $, click } = start();
		expect($("#panel-b").hidden).toBe(true);
		click("#tab-b");
		expect($("#panel-a").hidden).toBe(true);
		expect($("#panel-b").hidden).toBe(false);
		expect($("#tab-b").getAttribute("aria-selected")).toBe("true");
		expect($("#faq").hidden).toBe(true);
		click("#toggle");
		expect($("#faq").hidden).toBe(false);
		expect($("#toggle").getAttribute("aria-expanded")).toBe("true");
	});

	it("filters mock records by search and by tag, with an empty state", () => {
		const { $, click, dom } = start();
		const items = [
			...dom.window.document.querySelectorAll<HTMLElement>("[data-proto-item]"),
		];
		const search = $("#search") as HTMLInputElement;
		search.value = "bali";
		search.dispatchEvent(new (windowOf(dom).Event)("input", { bubbles: true }));
		expect(items.map((item) => item.hidden)).toEqual([false, true]);
		search.value = "zzz";
		search.dispatchEvent(new (windowOf(dom).Event)("input", { bubbles: true }));
		expect($("[data-proto-empty]").hidden).toBe(false);
		search.value = "";
		search.dispatchEvent(new (windowOf(dom).Event)("input", { bubbles: true }));
		click("#tag-pantai");
		expect(items.map((item) => item.hidden)).toEqual([false, true]);
		expect($("#tag-pantai").getAttribute("aria-pressed")).toBe("true");
	});

	it("blocks a checkout until a method is chosen and the form is valid, then navigates", () => {
		vi.useFakeTimers();
		const { $, click, sent } = start();
		click("#pay");
		vi.runAllTimers();
		expect($("#nama").getAttribute("aria-invalid")).toBe("true");
		expect(sent.some((message) => message.type === "proto:navigate")).toBe(
			false,
		);
		($("#nama") as HTMLInputElement).value = "Budi Contoh";
		click("#pay");
		vi.runAllTimers();
		expect(sent.some((message) => message.type === "proto:navigate")).toBe(
			false,
		);
		click("#method");
		click("#pay");
		vi.runAllTimers();
		expect(sent.at(-1)).toMatchObject({
			type: "proto:navigate",
			target: { screenId: "f3" },
		});
	});

	it("restores initial state from the parent and never posts a sensitive value", () => {
		const { $, dom, sent } = start({ status: "tersimpan" });
		expect($("#status").textContent).toBe("tersimpan");
		const password = $("#pw") as HTMLInputElement;
		password.value = "rahasia-nyata";
		password.dispatchEvent(
			new (windowOf(dom).Event)("input", { bubbles: true }),
		);
		expect(JSON.stringify(sent)).not.toContain("rahasia");
		expect(sent.some((message) => message.type === "proto:state")).toBe(false);
	});

	it("ignores init from any other sender or channel", () => {
		const harness = boot();
		open.push(harness.dom);
		const win = windowOf(harness.dom);
		win.dispatchEvent(
			new win.MessageEvent("message", {
				data: { type: "proto:init", channel: CHANNEL, state: { status: "x" } },
				source: win,
			}),
		);
		expect(harness.$("#status").textContent).toBe("menunggu");
	});
});

describe("P10 runtime safety", () => {
	it("contains no dynamic code execution and posts only to the configured origin", () => {
		const script = studioPrototypeRuntimeScript({
			channel: CHANNEL,
			screenId: "f1",
			origin: "https://app.test",
			interactions: {},
		});
		expect(script).not.toMatch(
			/\beval\s*\(|new Function|innerHTML|document\.write/,
		);
		expect(script).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
		expect(script).not.toMatch(/location\s*=|window\.open|top\./);
	});

	it("keeps an attacker-controlled string inside JSON data", () => {
		const script = studioPrototypeRuntimeScript({
			channel: CHANNEL,
			screenId: "f1",
			origin: "https://app.test",
			interactions: {
				"ix-1": {
					ix: "ix-1",
					type: "show_feedback",
					message: "</script><script>alert(1)</script>",
					tone: "info",
				},
			},
		});
		expect(script).not.toContain("</script>");
	});
});
