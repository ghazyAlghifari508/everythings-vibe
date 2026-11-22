import { describe, expect, it } from "vitest";
import {
	classifyStudioElement,
	resolveStudioElementParent,
	resolveStudioElementTarget,
	STUDIO_TARGET_ANCESTOR_LIMIT,
	supportsDirectTextEdit,
} from "../services/studio-element-targeting";
import type { StudioElementIdentity } from "../types/studio-element";

const id = (value: string) => ({ ...base, elementId: value });
const base: StudioElementIdentity = {
	projectId: "p",
	frameId: "f",
	baseRevision: 1,
	baseHash: "a".repeat(64),
	elementId: "node:1",
	selector: "body > div:nth-child(1)",
	tag: "div",
	role: null,
	label: "Card",
	signature: "b".repeat(64),
	parentId: null,
};

const withProps = (
	overrides: Partial<StudioElementIdentity>,
): StudioElementIdentity => ({ ...base, ...overrides });

describe("P7 element target classification", () => {
	it("separates text leaves from visual components", () => {
		expect(classifyStudioElement(withProps({ tag: "h2", label: "Bali" }))).toBe(
			"text",
		);
		expect(classifyStudioElement(withProps({ tag: "img", label: "" }))).toBe(
			"component",
		);
		expect(
			classifyStudioElement(withProps({ role: "button", tag: "div" })),
		).toBe("component");
	});

	it("hides decorative wrappers and protected document structure", () => {
		for (const tag of ["body", "head", "script", "br", "svg", "tr"]) {
			expect(classifyStudioElement(withProps({ tag }))).toBeNull();
		}
		expect(classifyStudioElement(withProps({ tag: "div" }))).toBeNull();
		expect(supportsDirectTextEdit(withProps({ tag: "div" }))).toBe(false);
	});

	it("keeps authored wrappers selectable", () => {
		expect(classifyStudioElement(id("id:product-card"))).toBe("component");
		expect(
			supportsDirectTextEdit(withProps({ tag: "p", label: "Harga" })),
		).toBe(true);
	});

	it("resolves nested content to the deepest meaningful target", () => {
		const elements = [
			withProps({ elementId: "id:card", tag: "article" }),
			withProps({
				elementId: "node:wrapper",
				tag: "div",
				parentId: "id:card",
			}),
			withProps({
				elementId: "node:title",
				tag: "h3",
				label: "Bali Escape",
				parentId: "node:wrapper",
			}),
		];
		expect(resolveStudioElementTarget("node:title", elements)?.elementId).toBe(
			"node:title",
		);
		expect(
			resolveStudioElementTarget("node:wrapper", elements)?.elementId,
		).toBe("id:card");
		expect(resolveStudioElementParent("node:title", elements)?.elementId).toBe(
			"id:card",
		);
	});

	it("bounds parent walks and rejects unknown or cyclic chains", () => {
		const elements = [
			withProps({ elementId: "a", parentId: "b" }),
			withProps({ elementId: "b", parentId: "a" }),
		];
		expect(resolveStudioElementTarget("a", elements)).toBeNull();
		expect(resolveStudioElementTarget("missing", elements)).toBeNull();
		const deep = Array.from(
			{ length: STUDIO_TARGET_ANCESTOR_LIMIT + 3 },
			(_, i) => withProps({ elementId: `n${i}`, parentId: `n${i + 1}` }),
		);
		expect(resolveStudioElementTarget("n0", deep)).toBeNull();
	});
});
