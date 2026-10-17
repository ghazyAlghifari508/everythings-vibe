// Handoff actions for `/api/ask/options`.
//
// The handoff is the authoritative server-side copy of the Ask flow state
// (answers, prompt, questions), so refresh, History navigation, and
// multi-device access keep it and a closed tab loses nothing.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSnapshots } from "@/db/schema";
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
		return Response.json({ error: "Handoff tidak valid" }, { status: 400 });
	try {
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
		await saveAskHandoff(userId, {
			...parsed.data,
			...(activeSnapshotId ? { snapshotId: activeSnapshotId } : {}),
		});
	} catch (e) {
		console.error("ask handoff save failed:", e);
		return Response.json({ error: "Gagal menyimpan handoff" }, { status: 500 });
	}
	return Response.json({ saved: true });
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
		return Response.json({ error: "Gagal memuat handoff" }, { status: 500 });
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
