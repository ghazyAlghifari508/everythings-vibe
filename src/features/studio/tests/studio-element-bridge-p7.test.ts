import { describe, expect, it } from "vitest";
import { indexStudioElements } from "../services/studio-element-document";
import {
	acceptStudioHoverMessage,
	acceptStudioSelectionMessage,
	acceptStudioTextMessage,
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

describe("Pencil bridge", () => {
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

	it("rejects delayed commits from another session, channel or frame", () => {
		const session = "12345678-1234-4234-8234-123456789abe";
		const data = {
			...envelope,
			type: "studio:element:text-commit",
			session,
			elementId: title.elementId,
			text: "new",
		};
		const receive = (patch: Partial<typeof data>) =>
			acceptStudioTextMessage(
				{ source, origin: "null", data: { ...data, ...patch } },
				{ ...expected, session, elementId: title.elementId },
			);
		expect(receive({})).toMatchObject({ text: "new" });
		expect(receive({ session: channel })).toBeNull();
		expect(receive({ channel: session })).toBeNull();
		expect(receive({ frameId: "other" })).toBeNull();
		expect(receive({ baseRevision: context.baseRevision + 1 })).toBeNull();
	});
});
