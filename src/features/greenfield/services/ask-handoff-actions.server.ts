// Handoff actions for `/api/ask/options`.
//
// The handoff is the authoritative server-side copy of the Ask flow state
// (answers, prompt, questions), so refresh, History navigation, and
// multi-device access keep it and a closed tab loses nothing.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { codebaseAskHandoffs, codebaseSnapshots, projects } from "@/db/schema";
import {
	askHandoffSchema,
	getAskHandoff,
	resolveActiveSnapshotId,
	saveAskHandoff,
} from "@/features/codebase/services/generation-context";

export async function saveAskHandoffAction(input: {
	userId: string;
	projectId: string;
	projectMode: string | null;
	handoff: unknown;
}): Promise<Response> {
	const { userId, projectId, projectMode, handoff } = input;
	const parsed = askHandoffSchema.safeParse({
		...(typeof handoff === "object" && handoff !== null ? handoff : {}),
		projectId,
	});
	if (!parsed.success)
		return Response.json(
			{ error: "Handoff tidak valid", code: "HANDOFF_VALIDATION_FAILED" },
			{ status: 400 },
		);
	try {
		return await db.transaction(async (tx) => {
			// Serialize with feature persistence so a late answer cannot rewrite its inputs.
			const [project] = await tx
				.select({
					featureTree: projects.featureTree,
					featuresStatus: projects.featuresStatus,
				})
				.from(projects)
				.where(
					and(
						eq(projects.id, projectId),
						eq(projects.userId, userId),
						isNull(projects.deletedAt),
					),
				)
				.for("update")
				.limit(1);
			if (!project)
				return Response.json(
					{ error: "Project not found", code: "PROJECT_NOT_FOUND" },
					{ status: 404 },
				);
			if (
				projectMode === "existing_codebase" &&
				(project.featureTree !== null ||
					project.featuresStatus === "generating")
			) {
				return Response.json(
					{
						error: "Klarifikasi sudah dikunci untuk spesifikasi fitur.",
						code: "HANDOFF_LOCKED",
					},
					{ status: 409 },
				);
			}
			// Concurrency guard: reject older writes when expectedUpdatedAt is behind
			if (parsed.data.expectedUpdatedAt) {
				const [existingHandoff] = await tx
					.select({ updatedAt: codebaseAskHandoffs.updatedAt })
					.from(codebaseAskHandoffs)
					.where(eq(codebaseAskHandoffs.projectId, projectId))
					.limit(1);
				if (
					existingHandoff?.updatedAt &&
					existingHandoff.updatedAt.getTime() >
						new Date(parsed.data.expectedUpdatedAt).getTime()
				) {
					return Response.json(
						{
							error:
								"Jawaban telah diperbarui di sesi lain. Muat ulang untuk menyinkronkan.",
							code: "HANDOFF_LOCKED",
						},
						{ status: 409 },
					);
				}
			}
			// Snapshot write-through: stamp the handoff with the snapshot that is
			// active at submit time for existing-codebase traceability. A
			// client-supplied snapshotId is never trusted blindly: it must belong to
			// this project or it is dropped in favor of the server-resolved active
			// snapshot.
			let activeSnapshotId: string | null = null;
			if (projectMode === "existing_codebase") {
				const candidate = parsed.data.snapshotId;
				if (candidate) {
					const [owned] = await db
						.select({ id: codebaseSnapshots.id })
						.from(codebaseSnapshots)
						.where(
							and(
								eq(codebaseSnapshots.id, candidate),
								eq(codebaseSnapshots.projectId, projectId),
							),
						)
						.limit(1);
					if (owned) activeSnapshotId = owned.id;
				}
				activeSnapshotId ??= await resolveActiveSnapshotId(projectId);
			}
			const now = new Date();
			await saveAskHandoff(
				userId,
				{
					...parsed.data,
					...(activeSnapshotId ? { snapshotId: activeSnapshotId } : {}),
				},
				tx,
			);
			return Response.json({ saved: true, updatedAt: now.toISOString() });
		});
	} catch (e) {
		console.error("ask handoff save failed:", e);
		return Response.json(
			{ error: "Gagal menyimpan handoff", code: "PERSISTENCE_FAILED" },
			{ status: 500 },
		);
	}
}

export async function getAskHandoffAction(input: {
	userId: string;
	projectId: string;
	projectName: string;
}): Promise<Response> {
	const { userId, projectId, projectName } = input;
	let saved: Awaited<ReturnType<typeof getAskHandoff>> | null;
	try {
		saved = await getAskHandoff(projectId, userId);
	} catch (e) {
		console.error("ask handoff read failed:", e);
		return Response.json(
			{ error: "Gagal memuat handoff", code: "PERSISTENCE_FAILED" },
			{ status: 500 },
		);
	}
	if (!saved) {
		// Fallback for projects pre-dating handoff persistence: synthesize minimal
		// state using project name so Ask flow does not bounce.
		saved = {
			projectId,
			answers: [],
			state: {
				prompt: projectName,
				platform: "web",
				session: 1,
				questions: [],
			},
		};
	}
	return Response.json({ handoff: saved });
}
