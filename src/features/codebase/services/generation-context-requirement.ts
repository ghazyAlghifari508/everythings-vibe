import {
	formatBoundedGenerationContext,
	type SnapshotGenerationContext,
} from "./generation-context-build";
import { getProjectGenerationContext } from "./generation-context-store.server";

const CODEBASE_BLOCK_START = "--- KONTEKS CODEBASE EXISTING ---";
const CODEBASE_BLOCK_END = "--- AKHIR KONTEKS CODEBASE ---";

/** Actionable failure returned by requireProjectGenerationContext when a
 *  repository-aware project cannot be grounded in a ready snapshot analysis. */
export interface GenerationContextUnavailable {
	status: number;
	code: "CODEBASE_CONTEXT_UNAVAILABLE";
	error: string;
}

const GENERATION_CONTEXT_UNAVAILABLE: GenerationContextUnavailable = {
	status: 409,
	code: "CODEBASE_CONTEXT_UNAVAILABLE",
	error:
		"Konteks repositori belum siap (analisis snapshot belum tersedia). Selesaikan sinkronisasi dan analisis, lalu coba lagi.",
};

/** Pure decision for a resolved project mode + context. Greenfield (or other
 *  modes) keep working without codebase context; existing_codebase without a
 *  ready analysis fails closed. */
export function decideContextRequirement(
	projectMode: string | null | undefined,
	context: SnapshotGenerationContext | null,
):
	| { context: SnapshotGenerationContext | null }
	| GenerationContextUnavailable {
	if (projectMode !== "existing_codebase") return { context: null };
	if (!context) return GENERATION_CONTEXT_UNAVAILABLE;
	return { context };
}

/**
 * Fail-closed context loader for existing-codebase generation.
 *
 * Returns `{ context: null }` for greenfield projects (the caller generates
 * WITHOUT codebase context — legitimate, unchanged behavior). For an
 * existing-codebase project with no ready snapshot analysis it returns an
 * actionable error instead of a null context, so a repository-aware stage can
 * never silently fall back to generic greenfield generation.
 */
export async function requireProjectGenerationContext(
	projectId: string,
): Promise<
	{ context: SnapshotGenerationContext | null } | GenerationContextUnavailable
> {
	try {
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const [project] = await db
			.select({ projectMode: projects.projectMode })
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.limit(1);
		if (project?.projectMode !== "existing_codebase") {
			return { context: null };
		}
		const context = await getProjectGenerationContext(projectId);
		return decideContextRequirement(project.projectMode, context);
	} catch (error) {
		// A repository-aware project must never silently continue on a context
		// error (including a DB/provider failure): fail closed.
		console.warn("requireProjectGenerationContext failed closed:", error);
		return GENERATION_CONTEXT_UNAVAILABLE;
	}
}

/** Single injection helper for Ask/PRD/AC/Task. Null (greenfield) returns ""
 *  so greenfield prompts stay byte-identical. Ready context returns a framed,
 *  bounded block that labels uncertainty as assumptions, instructs the
 *  model never to invent paths or architecture, and carries the change-scope
 *  and reuse discipline for an existing codebase. */
export function buildCodebasePromptBlock(
	context: SnapshotGenerationContext | null,
): string {
	if (!context) return "";
	const body = formatBoundedGenerationContext(context);
	return [
		"",
		CODEBASE_BLOCK_START,
		`Snapshot sumber: ${context.snapshotId}.`,
		body,
		"ATURAN: JANGAN mengarang jalur file, perilaku framework, atau detail arsitektur yang tidak ada di konteks di atas. Gunakan HANYA jalur dari daftar Relevant modules/files. Setiap hal yang tidak pasti adalah asumsi yang wajib diverifikasi — tandai sebagai asumsi, jangan sajikan sebagai fakta. HORMATI framework dan bahasa asli codebase — JANGAN mengalihkan framework (misal Vue ke React) atau memaksakan TypeScript jika codebase menggunakan JavaScript. Jika database terdeteksi None/client-side, DILARANG membuat skema database internal/SQL.",
		// Change-scope discipline: the repo is the ground truth for what already
		// exists, so the plan is a proportional change instead of a rebuild.
		"SCOPE PERUBAHAN: Aplikasi ini SUDAH ADA. Rencanakan PERUBAHAN yang diminta, bukan membangun ulang aplikasi. Gunakan analisis repositori di atas sebagai bukti tentang apa yang sudah tersedia — jangan merencanakan ulang hal yang sudah ada.",
		'REUSE: Utamakan memakai ulang modul, service, route, dan kontrak data yang sudah ada pada analisis. Perluas modul existing bila memadai. Bila sebuah file/modul disebut, path-nya harus berasal dari bukti di atas, atau dinyatakan eksplisit sebagai "proposed new file". JANGAN mencampuradukkan file existing dengan file baru yang diusulkan.',
		"LAYER KONDISIONAL: Setiap layer teknis (data/storage, service/domain, API, UI, state) hanya boleh direncanakan bila requirement atau bukti repositori mendukungnya. JANGAN mewajibkan migration database, endpoint backend, authentication/authorization, dashboard, atau infrastructure baru hanya karena template.",
		"PERTAHANKAN FUNGSI LAIN: Jangan mengubah perilaku, alur, atau modul existing yang tidak berkaitan dengan permintaan ini.",
		CODEBASE_BLOCK_END,
	].join("\n");
}
