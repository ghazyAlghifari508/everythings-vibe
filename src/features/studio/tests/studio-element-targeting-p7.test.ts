import { describe, expect, it } from "vitest";
import { indexStudioElements } from "../services/studio-element-document";

const context = { projectId: "p", frameId: "f", baseRevision: 1 };

describe("meaningful element targeting", () => {
	it("selects authored and recognizable cards, generic text and semantic controls", () => {
		const html = `
			<main>
				<div class="layout">
					<div id="id-card"><h2>Named card</h2></div>
					<div role="group"><h2>Role card</h2></div>
					<div data-studio-element-id="card:declared"><h2>Declared card</h2></div>
					<div class="product-card"><h2>Recognizable card</h2></div>
					<div data-card><h2>Canonical card</h2></div>
					<div>Generic text</div>
					<button>Buy</button>
					<nav><a href="#products">Products</a></nav>
					<ul><li>List item</li></ul>
					<form><input name="search"></form>
					<picture><img alt="Sample"></picture>
				</div>
			</main>`;
		const { elements } = indexStudioElements(html, context);
		expect(
			elements
				.filter((entry) => entry.tag === "div")
				.map(({ elementId, label, textEditable }) => ({
					elementId,
					label,
					textEditable,
				})),
		).toEqual([
			{ elementId: "id:id-card", label: "Named card", textEditable: undefined },
			{
				elementId: expect.stringMatching(/^node:/),
				label: "Role card",
				textEditable: undefined,
			},
			{
				elementId: "card:declared",
				label: "Declared card",
				textEditable: undefined,
			},
			{
				elementId: expect.stringMatching(/^node:/),
				label: "Recognizable card",
				textEditable: undefined,
			},
			{
				elementId: expect.stringMatching(/^node:/),
				label: "Canonical card",
				textEditable: undefined,
			},
			{
				elementId: expect.stringMatching(/^node:/),
				label: "Generic text",
				textEditable: true,
			},
		]);
		expect(elements.map(({ tag }) => tag)).toEqual(
			expect.arrayContaining([
				"button",
				"nav",
				"a",
				"ul",
				"li",
				"form",
				"input",
				"picture",
				"img",
			]),
		);
	});

	it("excludes hidden subtrees, internal nodes and unsupported document nodes", () => {
		const html = `
			<main>
				<div hidden><p id="hidden">Hidden</p></div>
				<div aria-hidden="true"><p>Decorative</p></div>
				<div inert><button>Inert</button></div>
				<div style="display:none"><p>Not displayed</p></div>
				<p style="visibility:hidden">Invisible</p>
				<input type="hidden" name="internal">
				<div data-ev-editor-overlay><button>Editor</button></div>
				<div data-ev-feedback role="status">Prototype feedback</div>
				<svg><text>Icon text</text></svg>
				<template><p>Template</p></template>
				<details><summary>Visible summary</summary><p>Collapsed</p></details>
				<p id="visible">Visible text</p>
			</main>`;
		expect(
			indexStudioElements(html, context).elements.map(({ tag }) => tag),
		).toEqual(["main", "details", "summary", "p"]);
	});

	it("links deeply nested content to the nearest indexed ancestor through unmarked wrappers", () => {
		const html = `<div data-studio-element-id="card">${"<div>".repeat(8)}<h3>Title</h3>${"</div>".repeat(8)}</div>`;
		const { elements } = indexStudioElements(html, context);
		expect(elements.map(({ tag, parentId }) => ({ tag, parentId }))).toEqual([
			{ tag: "div", parentId: null },
			{ tag: "h3", parentId: "card" },
		]);
	});
});
