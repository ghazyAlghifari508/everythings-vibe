import { describe, expect, it } from "vitest";
import type { StudioFrameRow } from "@/db/schema";
import {
	STUDIO_USER_MESSAGE_COLLAPSE_CHARS,
	STUDIO_USER_MESSAGE_COLLAPSE_LINES,
} from "../types/studio-constants";
import type {
	StudioMessageFrame,
	StudioMessageProgress,
} from "../types/studio-conversation";
import {
	describeStudioResult,
	describeStudioStatus,
	isLongStudioUserMessage,
	studioThumbnailGeometry,
} from "../utils/studio-chat-message";

const base: StudioMessageProgress = {
	phase: "completed",
	ready: 4,
	total: 4,
	failed: 0,
	screenNames: ["A", "B", "C", "D"],
	recovery: null,
};

describe("user message collapse threshold", () => {
	it("leaves a short prompt without an expansion control", () => {
		expect(isLongStudioUserMessage("Buat aplikasi travel")).toBe(false);
	});
	it("collapses past the character bound but not at it", () => {
		expect(
			isLongStudioUserMessage("a".repeat(STUDIO_USER_MESSAGE_COLLAPSE_CHARS)),
		).toBe(false);
		expect(
			isLongStudioUserMessage(
				"a".repeat(STUDIO_USER_MESSAGE_COLLAPSE_CHARS + 1),
			),
		).toBe(true);
	});
	it("collapses a short but many-line prompt", () => {
		const lines = Array.from(
			{ length: STUDIO_USER_MESSAGE_COLLAPSE_LINES + 1 },
			() => "x",
		).join("\n");
		expect(isLongStudioUserMessage(lines)).toBe(true);
	});
});

const frame = (
	id: string,
	name: string,
	over: Partial<StudioFrameRow> = {},
): StudioFrameRow => ({
	id,
	projectId: "p",
	name,
	description: null,
	viewport: "web",
	htmlCode: "<main>x</main>",
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
	...over,
});
const result = (
	frameId: string,
	over: Partial<StudioMessageFrame> = {},
): StudioMessageFrame => ({
	frameId,
	name: frameId,
	viewport: "web",
	status: "ready",
	revision: 1,
	...over,
});

describe("result card rows", () => {
	it("does not exist before any frame does", () => {
		expect(
			describeStudioResult(
				{ ...base, total: 0, ready: 0, screenNames: [] },
				[],
			),
		).toBeNull();
	});
	it("counts the real ready frames and names each one with its platform", () => {
		const card = describeStudioResult(
			{
				...base,
				total: 2,
				ready: 2,
				frames: [
					result("a", { name: "Kelola Pencairan" }),
					result("b", { name: "Kelola Pencairan", viewport: "mobile" }),
				],
			},
			[
				frame("a", "Kelola Pencairan"),
				frame("b", "Kelola Pencairan", { viewport: "mobile" }),
			],
		);
		expect(card?.title).toBe("2 layar dibuat");
		expect(card?.rows.map((row) => row.platform)).toEqual(["web", "mobile"]);
		expect(card?.rows.map((row) => row.frameId)).toEqual(["a", "b"]);
	});
	it("reports a revision as updated and a single frame in singular count form", () => {
		const card = describeStudioResult(
			{ ...base, kind: "revise", total: 1, ready: 1, frames: [result("a")] },
			[frame("a", "Profil")],
		);
		expect(card?.title).toBe("1 layar diperbarui");
	});
	it("never reports a partial batch as fully created", () => {
		const card = describeStudioResult(
			{
				...base,
				phase: "partial",
				total: 2,
				ready: 1,
				failed: 1,
				frames: [result("a"), result("b", { status: "failed" })],
			},
			[frame("a", "A"), frame("b", "B", { status: "failed", htmlCode: null })],
		);
		expect(card?.title).toBe("1 dari 2 layar dibuat");
		expect(card?.rows.map((row) => row.status)).toEqual(["ready", "failed"]);
	});
	it("only opens frames that exist in this project and flags a frame edited since", () => {
		const card = describeStudioResult(
			{ ...base, total: 2, ready: 2, frames: [result("a"), result("gone")] },
			[frame("a", "A", { revision: 4 })],
		);
		expect(card?.rows[0]).toMatchObject({ frameId: "a", changedSince: true });
		expect(card?.rows[1]).toMatchObject({ frameId: null });
	});
	it("resolves legacy name-only rows against current frames without inventing readiness", () => {
		const card = describeStudioResult(
			{
				...base,
				phase: "partial",
				total: 2,
				ready: 1,
				failed: 1,
				screenNames: ["A", "B"],
				failedScreens: ["B"],
			},
			[frame("a", "A")],
		);
		expect(
			card?.rows.map((row) => [row.name, row.status, row.frameId]),
		).toEqual([
			["A", "ready", "a"],
			["B", "failed", null],
		]);
	});
});

describe("operational status line", () => {
	it("is short, job-derived and active only while work runs", () => {
		const running = describeStudioStatus({
			status: "generating",
			progress: { ...base, phase: "generating", ready: 2, total: 4 },
		});
		expect(running).toEqual({ label: "Membuat layar 2 dari 4", running: true });
		const done = describeStudioStatus({ status: "completed", progress: base });
		expect(done).toEqual({ label: "Selesai", running: false });
		const failed = describeStudioStatus({
			status: "failed",
			progress: { ...base, phase: "failed", ready: 0 },
		});
		expect(failed.running).toBe(false);
	});
	it("reports how many screens need a retry on a partial result", () => {
		expect(
			describeStudioStatus({
				status: "partial",
				progress: { ...base, phase: "partial", ready: 3, failed: 1 },
			}).label,
		).toBe("1 layar perlu dicoba ulang");
	});
	it("states a revision as applying, not creating", () => {
		expect(
			describeStudioStatus({
				status: "generating",
				progress: {
					...base,
					kind: "revise",
					phase: "generating",
					ready: 0,
					total: 1,
				},
			}).label,
		).toBe("Menerapkan revisi 0 dari 1");
	});
});

describe("thumbnail geometry", () => {
	it("scales the real document width into the box without distortion", () => {
		for (const platform of ["web", "mobile"] as const) {
			const geometry = studioThumbnailGeometry(platform);
			expect(geometry.documentWidth * geometry.scale).toBeCloseTo(
				geometry.boxWidth,
			);
			expect(geometry.documentHeight * geometry.scale).toBeCloseTo(
				geometry.boxHeight,
				0,
			);
		}
	});
});
