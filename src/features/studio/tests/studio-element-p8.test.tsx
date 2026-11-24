// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StudioElementEditMenu } from "@/features/studio/components/canvas/studio-element-menu";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import { StudioElementFeedback } from "@/features/studio/components/workspace/studio-element-feedback";
import type { StudioElementEditing } from "@/features/studio/hooks/use-studio-element-editing";
import { indexStudioElements } from "@/features/studio/services/studio-element-document";
import {
	buildStudioElementEditSystemPrompt,
	deterministicStudioElementEdit,
	generateStudioElementEdit,
} from "@/features/studio/services/studio-element-generation";
import { patchStudioElement } from "@/features/studio/services/studio-element-patch";
import type {
	StudioElementPreview,
	StudioElementTarget,
} from "@/features/studio/types/studio-element";

const ai = vi.hoisted(() => ({
	calls: [] as unknown[][],
	response: '{"kind":"replace","html":"<section><h2>Updated</h2></section>"}',
}));
vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["test-model"],
	tryStreamWithFallback: async (...args: unknown[]) => {
		ai.calls.push(args);
		return {
			firstChunk: ai.response,
			generator: (async function* () {})(),
		};
	},
}));

const html =
	'<!doctype html><html><head></head><body><nav>Navbar</nav><main><section id="hero">Hero</section><section id="stats"><h2>Statistics</h2></section><section id="projects">Projects</section></main><footer>Contact</footer></body></html>';
const context = { projectId: "p", frameId: "f", baseRevision: 5 };
const indexed = indexStudioElements(html, context);
const hero = indexed.elements.find((item) => item.selector === "#hero");
const stats = indexed.elements.find((item) => item.selector === "#stats");
if (!hero || !stats) throw new Error("Missing indexed targets");
const bounds = { x: 20, y: 40, width: 120, height: 30 };
const textTarget: StudioElementTarget = { ...hero, bounds };
const componentTarget: StudioElementTarget = { ...stats, bounds };
const applied: StudioElementPreview = {
	id: "12345678-1234-4234-8234-123456789abc",
	frameId: "f",
	frameName: "Home",
	baseRevision: 5,
	baseHash: indexed.baseHash,
	target: textTarget,
	status: "applied",
	before: "Sebelum",
	after: "Sesudah",
	summary: "Teks diperbarui",
	appliedRevision: 6,
};
const messagesSchema = z.array(
	z.object({ role: z.string(), content: z.string() }),
);
const noop = async () => {};
function editing(overrides: Partial<StudioElementEditing> = {}) {
	const base: StudioElementEditing = {
		target: null,
		pending: null,
		undo: null,
		busy: false,
		error: "",
		selectTarget: () => {},
		clearTarget: () => {},
		submit: async () => ({ accepted: true }),
		transition: noop,
		refresh: noop,
	};
	return { ...base, ...overrides };
}
afterEach(() => {
	cleanup();
	ai.calls.length = 0;
});

describe("P8 deterministic text editing", () => {
	it("persists multiline text as literal text without modifying another section", () => {
		const result = patchStudioElement(html, context, textTarget, {
			kind: "text",
			text: "Baris satu\n<b>Promo</b>",
		});
		const parsed = new DOMParser().parseFromString(result, "text/html");
		expect(parsed.querySelector("#hero")?.textContent).toBe(
			"Baris satu\n<b>Promo</b>",
		);
		expect(parsed.querySelector("#hero b")).toBeNull();
		expect(parsed.querySelector("#stats")?.textContent).toBe("Statistics");
	});

	it("does not advertise direct editing for a component target", () => {
		render(
			<StudioElementEditMenu
				target={componentTarget}
				open
				onOpenChange={vi.fn()}
				onAction={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Edit Text")).toBeNull();
		expect(screen.getByText("Edit with AI")).toBeTruthy();
		expect(screen.getByText("Delete")).toBeTruthy();
	});

	it("does not advertise direct editing for a void element", () => {
		const imageTarget: StudioElementTarget = {
			...textTarget,
			tag: "img",
			selector: "#cover",
			elementId: "id:cover",
			textEditable: undefined,
		};
		render(
			<StudioElementEditMenu
				target={imageTarget}
				open
				onOpenChange={vi.fn()}
				onAction={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Edit Text")).toBeNull();
		expect(screen.getByText("Edit with AI")).toBeTruthy();
	});
});

describe("P8 scoped design intelligence delivery", () => {
	it("uses the compact guidance once through the actual AI path", async () => {
		const result = await generateStudioElementEdit(
			{
				requestId: crypto.randomUUID(),
				prompt: "Redesign this selected card only",
				target: componentTarget,
			},
			html,
			"# Brand\nPrimary color: #123456",
		);
		expect(result).toEqual({
			kind: "replace",
			html: "<section><h2>Updated</h2></section>",
		});
		expect(ai.calls).toHaveLength(1);
		const messages = messagesSchema.parse(ai.calls[0]?.[1]);
		expect(messages).toHaveLength(2);
		expect(messages[0]?.content).toBe(buildStudioElementEditSystemPrompt());
		expect(
			messages[0]?.content.match(/<ELEMENT_REVISION_GUIDANCE>/g),
		).toHaveLength(1);
		expect(messages[0]?.content).not.toContain("EVVIBE_DESIGN_INTELLIGENCE");
		expect(messages[0]?.content.length).toBeLessThan(2_400);
		const payload = z
			.object({
				instruction: z.string(),
				target: z.object({ tag: z.string() }),
				context: z.object({
					element: z.string(),
					parent: z.object({ tag: z.string() }).nullable(),
					siblings: z.array(z.object({ tag: z.string() })),
				}),
				tokens: z.unknown().nullable(),
			})
			.parse(JSON.parse(messages[1]?.content ?? "null"));
		expect(payload.instruction).toBe("Redesign this selected card only");
		expect(payload.context.element).toContain('id="stats"');
		expect(payload.context.parent?.tag).toBe("main");
		expect(payload.context.siblings.map((item) => item.tag)).toEqual([
			"section",
			"section",
		]);
		expect(payload.tokens).not.toBeNull();
	});

	it("recognizes deterministic text and removal instructions locally", () => {
		expect(deterministicStudioElementEdit("Hapus section ini")).toEqual({
			kind: "remove",
		});
		expect(
			deterministicStudioElementEdit('Ganti teks menjadi "<b>Promo</b>"'),
		).toEqual({ kind: "text", text: "<b>Promo</b>" });
		expect(
			deterministicStudioElementEdit(
				"Buat card ini lebih minimalis tanpa mengubah bagian lain",
			),
		).toBeNull();
		expect(ai.calls).toEqual([]);
	});
});

describe("P8 auto apply feedback and attachments", () => {
	it("offers concise applied feedback with Undo and no Apply dialog", () => {
		render(
			<StudioElementFeedback
				editing={editing({
					undo: applied,
					notice: { row: applied, kind: "text" },
				})}
			/>,
		);
		expect(screen.getByRole("status").textContent).toContain("Teks diperbarui");
		expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
		expect(screen.queryByText("Terapkan")).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("keeps legacy candidates explicit and never auto applies them", () => {
		const transition = vi.fn(async () => {});
		const legacy: StudioElementPreview = {
			...applied,
			status: "preview",
			appliedRevision: null,
		};
		render(
			<StudioElementFeedback
				editing={editing({ pending: legacy, transition })}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
		expect(transition).toHaveBeenCalledWith(legacy, "apply");
	});

	it("shows the exact element attachment and can remove it without touching frames", () => {
		const onRemoveElement = vi.fn();
		render(
			<StudioComposer
				onSubmit={vi.fn()}
				selectedFrames={[{ id: "f", name: "Home" }]}
				elementTarget={textTarget}
				onRemoveElement={onRemoveElement}
			/>,
		);
		expect(screen.getByText("Elemen terpilih")).toBeTruthy();
		expect(screen.getByText("Home / Hero")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Lepas Home / Hero" }));
		expect(onRemoveElement).toHaveBeenCalledTimes(1);
	});
});
