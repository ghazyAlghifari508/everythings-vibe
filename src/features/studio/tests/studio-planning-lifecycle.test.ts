import { describe, expect, it } from "vitest";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import {
	deriveStudioLifecycle,
	resolveStudioFrameStatus,
} from "../utils/studio-lifecycle";

const date = new Date("2026-01-01T00:00:00Z");
const project: StudioProjectRow = {
	id: "p",
	userId: "u",
	title: "Sample",
	titleSource: "auto",
	designMode: "web",
	designMd: null,
	designSkillId: "none",
	initialPageCount: 1,
	designReference: null,
	designBlueprint: null,
	designBlueprintVersion: 1,
	designSkillVersion: null,
	logoAssetId: null,
	prdContent: null,
	prdFilename: null,
	prdContentHash: null,
	createdAt: date,
	updatedAt: date,
};
const slot: StudioFrameRow = {
	id: "f",
	projectId: "p",
	name: "Layar 1",
	description: "",
	viewport: "web",
	htmlCode: null,
	status: "queued",
	order: 0,
	error: null,
	attempts: 0,
	visualHash: null,
	promptHash: null,
	createdAt: date,
	updatedAt: date,
};
const job: StudioJobRow = {
	id: "j",
	projectId: "p",
	userId: "u",
	prompt: "Sample",
	jobType: "initial",
	targetFrameId: null,
	status: "planning",
	error: null,
	claimedBy: null,
	attempts: 1,
	claimedAt: null,
	leaseExpiresAt: null,
	startedAt: date,
	finishedAt: null,
	createdAt: date,
	updatedAt: date,
};
const state = (status: string, frames = [slot]) => ({
	project,
	frames,
	activeJob: { ...job, status },
});

describe("Studio planning lifecycle", () => {
	it.each([
		"queued",
		"planning",
		"generating",
	])("never reports missing blueprint or HTML as failure during %s", (status) => {
		const lifecycle = deriveStudioLifecycle(state(status));
		expect(lifecycle.phase).toBe(status);
		expect(lifecycle.planningFailed).toBe(false);
		expect(lifecycle.canRetryPlanning).toBe(false);
		expect(lifecycle.isProcessing).toBe(true);
	});
	it.each([
		{ frames: [] },
		{ frames: [slot] },
	])("offers recovery only after an initial planning failure", ({ frames }) => {
		expect(deriveStudioLifecycle(state("failed", frames))).toMatchObject({
			planningFailed: true,
			canRetryPlanning: true,
			isProcessing: false,
		});
	});
	it("does not invent failure without a backend job", () => {
		expect(
			deriveStudioLifecycle({ project, frames: [slot], activeJob: null })
				.canRetryPlanning,
		).toBe(false);
	});
	it.each([
		"completed",
		"partial",
	])("retains successful HTML in %s", (status) => {
		const ready = { ...slot, status: "ready", htmlCode: "<main>Saved</main>" };
		expect(deriveStudioLifecycle(state(status, [ready]))).toMatchObject({
			phase: status,
			planningFailed: false,
			canRetryPlanning: false,
			isProcessing: false,
		});
		expect(
			resolveStudioFrameStatus(ready, state(status, [ready]).activeJob),
		).toBe("ready");
	});
	it("distinguishes completed missing data from a planning failure without loading forever", () => {
		expect(deriveStudioLifecycle(state("completed"))).toMatchObject({
			inconsistent: true,
			planningFailed: false,
			canRetryPlanning: false,
			isProcessing: false,
		});
		expect(resolveStudioFrameStatus(slot, state("completed").activeJob)).toBe(
			"failed",
		);
	});
	it("does not classify failed frame generation as a failed plan", () => {
		const planned = {
			...slot,
			name: "Overview",
			description: "Dashboard",
			status: "failed",
		};
		expect(
			deriveStudioLifecycle(state("failed", [planned])).planningFailed,
		).toBe(false);
	});
	it.each([
		"queued",
		"planning",
		"generating",
	])("shows retried provisional slots as pending during %s", (status) => {
		const failed = { ...slot, status: "failed" };
		expect(resolveStudioFrameStatus(failed, state(status).activeJob)).toBe(
			status === "generating" ? "generating" : "queued",
		);
	});
	it("does not hide failed frames behind unrelated running work", () => {
		const failed = { ...slot, name: "Overview", status: "failed" };
		expect(
			resolveStudioFrameStatus(failed, {
				...job,
				jobType: "retry",
				targetFrameId: "other",
				status: "generating",
			}),
		).toBe("failed");
	});
});
