import { describe, expect, it } from "vitest";
import { indexStudioElements } from "../services/studio-element-document";
import {
	acceptStudioHoverMessage,
	acceptStudioInventoryMessage,
	acceptStudioSelectionMessage,
	STUDIO_ELEMENT_INVENTORY_MAX,
	studioSelectionBridgeScript,
} from "../utils/studio-element-bridge";

const context = { projectId: "p", frameId: "f", baseRevision: 3 };
const html = `<!doctype html><html><head></head><body>
<section id="card"><div class="wrapper"><h3 id="title">Bali Escape</h3></div><img src="x" alt="Bali"></section>
</body></html>`;
const indexed = indexStudioElements(html, context);
const channel = "12345678-1234-4234-8234-123456789abc";
const baseHash = indexed.baseHash;
const source = {};
const envelope = { ...context, baseHash, channel };
const expected = { ...envelope, source, elements: indexed.elements };
const title = indexed.elements.find((item) => item.elementId === "id:title");
if (!title) throw new Error("Missing title");
const bounds = { x: 8, y: 16, width: 120, height: 40 };
const hover = {
	...envelope,
	type: "studio:element:hover",
	elementId: title.elementId,
	bounds,
};

describe("P7 hover and inventory bridge", () => {
	it("accepts a hover only for a known element from the exact sandbox", () => {
		expect(
			acceptStudioHoverMessage(
				{ source, origin: "null", data: hover },
				expected,
			),
		).toMatchObject({ type: "hover", elementId: title.elementId, bounds });
		expect(
			acceptStudioHoverMessage(
				{ source, origin: "null", data: { ...hover, elementId: "forged" } },
				expected,
			),
		).toBeNull();
		expect(
			acceptStudioHoverMessage(
				{ source: {}, origin: "null", data: hover },
				expected,
			),
		).toBeNull();
	});

	it("clears hover without mutating the current selection", () => {
		const result = acceptStudioHoverMessage(
			{
				source,
				origin: "null",
				data: { ...envelope, type: "studio:element:hover-clear" },
			},
			expected,
		);
		expect(result).toEqual({ type: "hover-clear" });
		expect(
			acceptStudioSelectionMessage(
				{
					source,
					origin: "null",
					data: {
						...envelope,
						type: "studio:element:hover-clear",
					},
				},
				expected,
			),
		).toBeNull();
	});

	it("bounds the one-time overlay inventory and filters unknown ids", () => {
		const regions = Array.from(
			{ length: STUDIO_ELEMENT_INVENTORY_MAX + 1 },
			() => ({
				elementId: title.elementId,
				bounds,
			}),
		);
		expect(
			acceptStudioInventoryMessage(
				{
					source,
					origin: "null",
					data: { ...envelope, type: "studio:element:inventory", regions },
				},
				expected,
			),
		).toBeNull();
		const accepted = acceptStudioInventoryMessage(
			{
				source,
				origin: "null",
				data: {
					...envelope,
					type: "studio:element:inventory",
					regions: [
						{ elementId: title.elementId, bounds },
						{ elementId: "forged", bounds },
					],
				},
			},
			expected,
		);
		expect(accepted?.regions).toEqual([{ elementId: title.elementId, bounds }]);
	});

	it("emits pointer hover and a capped inventory from the isolated document", () => {
		const script = studioSelectionBridgeScript(
			envelope,
			"https://example.test",
		);
		expect(script).toContain("pointermove");
		expect(script).toContain("studio:element:hover-clear");
		expect(script).toContain("studio:element:inventory");
		expect(script).toContain(String(STUDIO_ELEMENT_INVENTORY_MAX));
		expect(script).toContain("requestAnimationFrame");
		expect(script).not.toContain("addEventListener('message'");
	});
});
