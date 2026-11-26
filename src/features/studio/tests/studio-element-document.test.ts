import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	indexStudioElements,
	resolveStudioElement,
} from "../services/studio-element-document";
import { buildStudioInspectionDocument } from "../services/studio-element-inspection";
import { patchStudioElement } from "../services/studio-element-patch";
import { STUDIO_INSPECTION_ATTR } from "../types/studio-element";

const html =
	'<!doctype html><html><head><style>.card{color:red}</style></head><body><nav id="nav">Navigation</nav><main><section id="hero">Hero</section><section id="stats"><h2>Statistics</h2><p>24 projects</p></section><section id="projects">Projects</section></main><footer>Contact</footer></body></html>';
const context = { projectId: "project-a", frameId: "frame-a", baseRevision: 5 };
const bounds = { x: 0, y: 0, width: 100, height: 50 };
function target(source = html, selector = "#stats") {
	const indexed = indexStudioElements(source, context);
	const entry = indexed.elements.find((item) => item.selector === selector);
	if (!entry) throw new Error(`Missing ${selector}`);
	return { ...entry, bounds };
}

describe("version-bound element identity", () => {
	it("retains authored and generated identities across unrelated sibling insertion", () => {
		const before = indexStudioElements(html, context);
		const after = indexStudioElements(
			html.replace("<footer>", "<aside>Extra</aside><footer>"),
			context,
		);
		for (const entry of before.elements)
			expect(
				after.elements.find((item) => item.signature === entry.signature)
					?.elementId,
			).toBe(entry.elementId);
	});
	it("rejects wrong frame, project, version and changed HTML at the same version", () => {
		const selected = target();
		for (const mismatch of [
			{ frameId: "frame-b" },
			{ projectId: "project-b" },
			{ baseRevision: 6 },
		])
			expect(() =>
				resolveStudioElement(html, { ...context, ...mismatch }, selected),
			).toThrow();
		expect(() =>
			resolveStudioElement(html.replace("Hero", "New Hero"), context, selected),
		).toThrow();
	});
	it("resolves duplicate IDs through unique paths and keeps audited parent identities", () => {
		const duplicate =
			'<section id="card"><div><p id="title">First</p></div></section><section id="card"><div><p id="title">Second</p></div></section>';
		const { elements } = indexStudioElements(duplicate, context);
		const cards = elements.filter((element) => element.tag === "section");
		const titles = elements.filter((element) => element.tag === "p");
		expect(cards).toHaveLength(2);
		expect(titles.map((entry) => entry.parentId)).toEqual(
			cards.map((entry) => entry.elementId),
		);
		expect(new Set(elements.map((entry) => entry.elementId)).size).toBe(4);
		for (const title of titles) {
			const resolved = resolveStudioElement(duplicate, context, {
				...title,
				bounds,
			});
			try {
				expect(resolved.node.textContent).toBe(title.label);
			} finally {
				resolved.dom.window.close();
			}
		}
		expect(() =>
			resolveStudioElement(duplicate, context, {
				...titles[0],
				bounds,
				selector: "#title",
			}),
		).toThrowError(expect.objectContaining({ code: "STUDIO_STALE_REVISION" }));
	});
	it("requires reselection when the target is removed or its identity is forged", () => {
		expect(() =>
			resolveStudioElement(
				html.replace(/<section id="stats">[\s\S]*?<\/section>/, ""),
				context,
				target(),
			),
		).toThrow();
		expect(() =>
			resolveStudioElement(html, context, {
				...target(),
				signature: "0".repeat(64),
			}),
		).toThrow();
	});
});

describe("inspection DOM markers", () => {
	it("instruments only selectable nodes and maps editability to a surviving source text node", async () => {
		const source = `<article data-studio-element-id="authored">
			<div class="layout" data-ev-inspect-id="spoof" data-ev-edit-text><span id="caption" contenteditable="true">Edit me <em>Keep emphasis</em></span></div>
			<p id="split">Before <a>link</a> after</p>
			<p id="removed">Text <iframe></iframe> </p>
			<p id="hidden" hidden>Hidden</p>
		</article>`;
		const inspection = await buildStudioInspectionDocument(
			source,
			context,
			crypto.randomUUID(),
			"https://app.test",
		);
		const dom = new JSDOM(inspection.html);
		try {
			const document = dom.window.document;
			const marked = document.querySelectorAll(`[${STUDIO_INSPECTION_ATTR}]`);
			expect(
				[...marked].map((node) => node.getAttribute(STUDIO_INSPECTION_ATTR)),
			).toEqual(inspection.elements.map((entry) => entry.elementId));
			expect(
				document.querySelector(".layout")?.getAttribute("tabindex"),
			).toBeNull();
			const flags = (selector: string) => ({
				hasMarker: document
					.querySelector(selector)
					?.hasAttribute("data-ev-edit-text"),
				textEditable: inspection.elements.find(
					(entry) => entry.selector === selector,
				)?.textEditable,
			});
			expect(
				document.querySelector("#caption")?.hasAttribute("contenteditable"),
			).toBe(false);
			expect(flags("#caption")).toEqual({
				hasMarker: true,
				textEditable: true,
			});
			for (const selector of [".layout", "#split", "#removed"])
				expect(flags(selector)).toEqual({
					hasMarker: false,
					textEditable: undefined,
				});
		} finally {
			dom.window.close();
		}
	});
});

describe("structural scoped patches", () => {
	it("removes exactly the selected section and preserves all surrounding source bytes", () => {
		const result = patchStudioElement(html, context, target(), {
			kind: "remove",
		});
		expect(result).toBe(
			html.replace(
				'<section id="stats"><h2>Statistics</h2><p>24 projects</p></section>',
				"",
			),
		);
		expect(
			[...new JSDOM(result).window.document.querySelectorAll("section")].map(
				(node) => node.id,
			),
		).toEqual(["hero", "projects"]);
	});
	it("changes a known text node without replacing its siblings", () => {
		const result = patchStudioElement(html, context, target(html, "#hero"), {
			kind: "text",
			text: "Hello <world>",
		});
		expect(
			new JSDOM(result).window.document.querySelector("#hero")?.textContent,
		).toBe("Hello <world>");
		expect(result.slice(result.indexOf('<section id="stats">'))).toBe(
			html.slice(html.indexOf('<section id="stats">')),
		);
		expect(() =>
			patchStudioElement(html, context, target(), {
				kind: "text",
				text: "Would destroy children",
			}),
		).toThrow();
	});
	it("patches only the source text range in mixed markup, including when cleared", () => {
		const source =
			'<button id="cta" class="signup"><svg><path /></svg><!--keep-->  Join &amp; save  <em>today</em></button>';
		const selected = target(source, "#cta");
		expect(
			patchStudioElement(source, context, selected, {
				kind: "text",
				text: "Join <now>",
			}),
		).toBe(source.replace("  Join &amp; save  ", "Join &lt;now&gt;"));
		expect(
			patchStudioElement(source, context, selected, { kind: "text", text: "" }),
		).toBe(source.replace("  Join &amp; save  ", ""));
	});
	it("treats unchanged decoded text as a no-op without rewriting source entities", () => {
		const source = '<p id="count">&#49; &amp; counting</p>';
		expect(
			patchStudioElement(source, context, target(source, "#count"), {
				kind: "text",
				text: "1 & counting",
			}),
		).toBe(source);
	});
	it("rejects a text patch when multiple direct text nodes surround inline markup", () => {
		const source = '<p id="summary">Start <a>link</a> end</p>';
		expect(() =>
			patchStudioElement(source, context, target(source, "#summary"), {
				kind: "text",
				text: "Changed",
			}),
		).toThrowError(expect.objectContaining({ code: "STUDIO_INVALID_INPUT" }));
	});
	it("replaces a component only within its root and retains its authored anchor", () => {
		const result = patchStudioElement(html, context, target(), {
			kind: "replace",
			html: "<section><h2>Experience</h2><p>Selected card only</p></section>",
		});
		expect(
			new JSDOM(result).window.document.querySelector("#stats h2")?.textContent,
		).toBe("Experience");
		expect(result).toContain(
			'<section id="projects">Projects</section></main><footer>Contact</footer>',
		);
	});
	it.each([
		"<section><script>alert(1)</script></section>",
		'<section onclick="alert(1)">Bad</section>',
		'<section><img src="javascript:alert(1)"></section>',
		'<section><iframe srcdoc="bad"></iframe></section>',
		"<section><style>nav{display:none}</style></section>",
		'<section style="position:fixed;inset:0">Bad</section>',
		'<section id="projects">Duplicate</section>',
		"<html><body>Entire document</body></html>",
		"<section>One</section><section>Two</section>",
		"<section data-ev-editor-overlay>Overlay</section>",
		'<section><form action="https://evil.test">Submit</form></section>',
		'<section><input name="value" form="unrelated-form"></section>',
		'<section><button popovertarget="unrelated">Open</button></section>',
		'<section><div style="p\\6fsition:fixed;inset:0">Overlay</div></section>',
	])("rejects unsafe or out-of-scope replacement %s", (replacement) => {
		expect(() =>
			patchStudioElement(html, context, target(), {
				kind: "replace",
				html: replacement,
			}),
		).toThrow();
	});
	it("validates known image references and narrow attributes", () => {
		const source = html.replace(
			"24 projects",
			'<img id="portrait" src="https://example.org/old.png" alt="Portrait">',
		);
		const image = target(source, "#portrait");
		const changed = patchStudioElement(source, context, image, {
			kind: "attribute",
			name: "src",
			value: "https://example.org/new.png",
		});
		expect(
			new JSDOM(changed).window.document
				.querySelector("#portrait")
				?.getAttribute("src"),
		).toBe("https://example.org/new.png");
		expect(() =>
			patchStudioElement(source, context, image, {
				kind: "attribute",
				name: "src",
				value: "javascript:alert(1)",
			}),
		).toThrow();
	});
	it("rejects a replacement that reparents surrounding content during document parsing", () => {
		const source =
			'<!doctype html><html><body><p><span id="selected">Selected</span><em>Keep sibling</em></p><footer>Keep footer</footer></body></html>';
		expect(() =>
			patchStudioElement(source, context, target(source, "#selected"), {
				kind: "replace",
				html: "<span><section>Break parent structure</section></span>",
			}),
		).toThrow();
	});
});
