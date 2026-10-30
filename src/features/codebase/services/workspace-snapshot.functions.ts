import { createServerFn } from "@tanstack/react-start";
import type { SnapshotFilePreviewResult } from "@/features/codebase/types/source-preview";
import { requireUserServer } from "@/lib/session";

export const loadSnapshotManifest = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseSnapshotFiles, codebaseSnapshots } =
			await import("@/db/schema");
		const { manifestEntrySchema, SNAPSHOT_CONTEXT_STATUSES } = await import(
			"@/features/codebase/services/sync"
		);
		const { and, asc, desc, eq, inArray } = await import("drizzle-orm");
		const { CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS } = await import(
			"@/features/codebase/types/codebase-constants"
		);
		const [codebase] = await db
			.select({ id: codebases.id })
			.from(codebases)
			.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const [snapshot] = await db
			.select({
				id: codebaseSnapshots.id,
				manifest: codebaseSnapshots.manifest,
				fileCount: codebaseSnapshots.fileCount,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, id),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		if (!snapshot)
			return {
				snapshotId: null,
				files: [] as Array<{ path: string }>,
				fileCount: 0,
				packageJsonText: null as string | null,
				packageJsonTexts: [] as string[],
			};
		const parsed = manifestEntrySchema.array().safeParse(snapshot.manifest);
		const manifest = parsed.success ? parsed.data : [];
		const rows = await db
			.select({
				path: codebaseSnapshotFiles.path,
				chunkIndex: codebaseSnapshotFiles.chunkIndex,
				data: codebaseSnapshotFiles.data,
			})
			.from(codebaseSnapshotFiles)
			.where(eq(codebaseSnapshotFiles.snapshotId, snapshot.id))
			.orderBy(
				asc(codebaseSnapshotFiles.path),
				asc(codebaseSnapshotFiles.chunkIndex),
			);
		const chunksByPath = new Map<string, string[]>();
		for (const row of rows) {
			const group = chunksByPath.get(row.path) ?? [];
			group[row.chunkIndex] = row.data;
			chunksByPath.set(row.path, group);
		}
		const packageJsonEntries = manifest
			.filter(
				(entry) =>
					!entry.path.includes("node_modules/") &&
					(entry.path === "package.json" ||
						entry.path.endsWith("/package.json")),
			)
			.sort((a, b) => {
				if (a.path === "package.json") return -1;
				if (b.path === "package.json") return 1;
				return a.path.length - b.path.length;
			});

		const packageJsonTexts: string[] = [];
		let primaryPackageJsonText: string | null = null;
		for (const entry of packageJsonEntries) {
			const group = chunksByPath.get(entry.path);
			if (!group) continue;
			try {
				const text = Buffer.from(group.join(""), "base64").toString("utf8");
				const bounded = text.slice(0, CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS);
				if (!primaryPackageJsonText) {
					primaryPackageJsonText = bounded;
				}
				packageJsonTexts.push(bounded);
			} catch {}
		}
		return {
			snapshotId: snapshot.id,
			files: manifest.map((entry) => ({ path: entry.path })),
			fileCount: snapshot.fileCount ?? manifest.length,
			packageJsonText: primaryPackageJsonText,
			packageJsonTexts,
		};
	});

export const loadSnapshotFileContent = createServerFn({ method: "GET" })
	.validator((input: { codebaseId: string; path: string }) => input)
	.handler(async ({ data: input }): Promise<SnapshotFilePreviewResult> => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseSnapshotFiles, codebaseSnapshots } =
			await import("@/db/schema");
		const {
			isSafeRelativePath,
			isStrictBase64,
			manifestEntrySchema,
			SNAPSHOT_CONTEXT_STATUSES,
		} = await import("@/features/codebase/services/sync");
		const {
			assembleSnapshotFileChunks,
			isDisplayableTextContent,
			truncatePreviewContent,
		} = await import("@/features/codebase/services/snapshot-preview");
		const { and, asc, desc, eq, inArray } = await import("drizzle-orm");
		const { CODEBASE_FILE_PREVIEW_MAX_CHARS } = await import(
			"@/features/codebase/types/codebase-constants"
		);
		const requestedPath = input.path.trim();
		if (!isSafeRelativePath(requestedPath)) {
			return { status: "unavailable", snapshotId: null, path: requestedPath };
		}
		const [codebase] = await db
			.select({ id: codebases.id })
			.from(codebases)
			.where(
				and(eq(codebases.id, input.codebaseId), eq(codebases.userId, user.id)),
			)
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const [snapshot] = await db
			.select({
				id: codebaseSnapshots.id,
				manifest: codebaseSnapshots.manifest,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, input.codebaseId),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		if (!snapshot)
			return { status: "unavailable", snapshotId: null, path: requestedPath };
		const parsedManifest = manifestEntrySchema
			.array()
			.safeParse(snapshot.manifest ?? []);
		if (!parsedManifest.success)
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		// Only files this snapshot actually uploaded are readable.
		const entry = parsedManifest.data.find(
			(item) => item.path === requestedPath,
		);
		if (!entry)
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		const rows = await db
			.select({
				chunkIndex: codebaseSnapshotFiles.chunkIndex,
				chunkTotal: codebaseSnapshotFiles.chunkTotal,
				data: codebaseSnapshotFiles.data,
			})
			.from(codebaseSnapshotFiles)
			.where(
				and(
					eq(codebaseSnapshotFiles.snapshotId, snapshot.id),
					eq(codebaseSnapshotFiles.path, requestedPath),
				),
			)
			.orderBy(asc(codebaseSnapshotFiles.chunkIndex));
		const assembled = assembleSnapshotFileChunks(rows);
		if (!assembled || !isStrictBase64(assembled))
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		let decoded: string;
		try {
			decoded = Buffer.from(assembled, "base64").toString("utf8");
		} catch {
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		}
		if (!isDisplayableTextContent(decoded)) {
			return {
				status: "unsupported",
				snapshotId: snapshot.id,
				path: requestedPath,
				sizeBytes: entry.size,
			};
		}
		const bounded = truncatePreviewContent(
			decoded,
			CODEBASE_FILE_PREVIEW_MAX_CHARS,
		);
		return {
			status: "ok",
			snapshotId: snapshot.id,
			path: requestedPath,
			content: bounded.content,
			truncated: bounded.truncated,
			sizeBytes: entry.size,
		};
	});
