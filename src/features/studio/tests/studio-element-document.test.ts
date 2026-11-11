import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	indexStudioElements,
	resolveStudioElement,
} from "../services/studio-element-document";
import { patchStudioElement } from "../services/studio-element-patch";

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
	it("rejects ambiguous selectors rather than picking the first matching node", () => {
		const duplicate = html.replace('id="hero"', 'id="stats"');
		expect(() =>
			resolveStudioElement(duplicate, context, {
				...target(duplicate, "#stats"),
				selector: "section",
			}),
		).toThrow();
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
