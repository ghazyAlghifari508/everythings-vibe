import { z } from "zod";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import { studioDesignBlueprintSchema } from "../services/studio-design-blueprint";
import {
	studioDesignReferenceMetadataSchema,
	studioDesignSkillIdSchema,
} from "../services/studio-generation-options";
import { STUDIO_JOB_QUEUE_HEALTH_MS } from "./studio-constants";

const date = z.union([
	z.date(),
	z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
]);
const nullableText = z.string().nullable();
const timestamps = { createdAt: date, updatedAt: date };

const projectSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1),
	title: z.string(),
	designMode: z.enum(["web", "mobile"]),
	designMd: nullableText,
	designSkillId: studioDesignSkillIdSchema,
	initialPageCount: z.int().nullable(),
	designReference: studioDesignReferenceMetadataSchema.nullable(),
	designBlueprint: studioDesignBlueprintSchema.nullable(),
	designBlueprintVersion: z.int(),
	designSkillVersion: z.int().nullable(),
	logoAssetId: nullableText,
	prdContent: nullableText,
	prdFilename: nullableText,
	prdContentHash: nullableText,
	...timestamps,
}) satisfies z.ZodType<StudioProjectRow>;

const frameSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	name: z.string(),
	description: nullableText,
	viewport: z.enum(["web", "mobile"]),
	htmlCode: nullableText,
	status: z.enum(["queued", "generating", "ready", "failed"]),
	order: z.int().nonnegative(),
	error: nullableText,
	attempts: z.int().nonnegative(),
	visualHash: nullableText,
	promptHash: nullableText,
	...timestamps,
}) satisfies z.ZodType<StudioFrameRow>;

const jobSchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
	userId: z.string().min(1),
	prompt: z.string(),
	jobType: z.string(),
	targetFrameId: nullableText,
	status: z.enum([
		"queued",
		"planning",
		"generating",
		"completed",
		"partial",
		"failed",
	]),
	error: nullableText,
	claimedBy: nullableText,
	attempts: z.int().nonnegative(),
	claimedAt: date.nullable(),
	leaseExpiresAt: date.nullable(),
	startedAt: date.nullable(),
	finishedAt: date.nullable(),
	...timestamps,
}) satisfies z.ZodType<StudioJobRow>;

export const studioStatusSchema = z
	.object({
		project: projectSchema,
		frames: z.array(frameSchema),
		activeJob: jobSchema.nullable(),
	})
	.refine(
		({ project, frames, activeJob }) =>
			frames.every((frame) => frame.projectId === project.id) &&
			(!activeJob ||
				(activeJob.projectId === project.id &&
					activeJob.userId === project.userId)) &&
			new Set(frames.map((frame) => frame.id)).size === frames.length,
	);

export interface StudioStatus {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
}

export function isStudioProcessing({ frames, activeJob }: StudioStatus) {
	return (
		Boolean(
			activeJob &&
				["queued", "planning", "generating"].includes(activeJob.status),
		) ||
		frames.some(
			(frame) => frame.status === "queued" || frame.status === "generating",
		)
	);
}

/**
 * A job stays unclaimed only when no worker is polling, and stays past its
 * lease only when the worker heartbeat died. Both are jobs that will never
 * finish on their own, so they are named instead of leaving the shimmer silent.
 */
export function resolveStudioQueueHealth(
	activeJob: StudioJobRow | null,
	now = Date.now(),
): string | null {
	if (
		!activeJob ||
		!["queued", "planning", "generating"].includes(activeJob.status)
	)
		return null;
	if (activeJob.leaseExpiresAt && activeJob.leaseExpiresAt.getTime() <= now)
		return "Heartbeat worker tidak aktif. Job menunggu pemulihan otomatis.";
	if (
		now - activeJob.createdAt.getTime() > STUDIO_JOB_QUEUE_HEALTH_MS &&
		!activeJob.claimedBy
	)
		return "Belum ada worker Studio yang mengambil job ini. Jalankan worker agar antrean dilanjutkan.";
	return null;
}
