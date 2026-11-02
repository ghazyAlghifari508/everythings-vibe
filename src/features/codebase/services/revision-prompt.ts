import { z } from "zod";
import type { ProjectFeatureTree } from "@/db/schema";
import { MAX_PROMPT_LENGTH, MAX_RESUME_CONTENT_CHARS } from "@/lib/constants";
import type { CodebaseAnalysis } from "./analysis-schema";

export const revisionPrdOutputSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("patch"),
			patch: z
				.string()
				.max(MAX_RESUME_CONTENT_CHARS)
				.refine((value) => value.trim().length > 0),
		})
		.strict(),
	z
		.object({
			kind: z.literal("conflict"),
			explanation: z
				.string()
				.max(MAX_PROMPT_LENGTH)
				.refine((value) => value.trim().length > 0),
		})
		.strict(),
]);

export function buildRevisionPrdMessages(input: {
	instruction: string;
	base: string;
	analysis: CodebaseAnalysis;
	references: Array<{ path: string; content: string }>;
	upstream: {
		feature: ProjectFeatureTree | null;
		prd: { id: string; content: string } | null;
	};
	dependencies: {
		ac: { id: string; content: string } | null;
		tasks: Array<{
			id: string;
			title: string;
			description: string | null;
			status: string | null;
			subtasks: unknown;
			covers: string[] | null;
		}>;
	};
}) {
	return {
		system: `Anda menyusun usulan revisi PRD, bukan menerapkan perubahan. Ikuti instruksi pengguna secara tepat; jangan menambah scope, mengganti kebutuhan, atau menghapus requirement yang tidak diminta. Pertahankan seluruh bagian lain. Gunakan hanya fakta dari snapshot dan dokumen yang diberikan; jangan mengarang file, route, dependency, atau API. Keluarkan JSON dengan kind "conflict" dan explanation bila instruksi bertentangan atau tidak dapat diterapkan tanpa asumsi; jangan sertakan patch. Jika dapat direvisi, keluarkan JSON dengan kind "patch" dan patch berisi hanya blok lengkap :::UPDATE_SECTION[Nama Section]::: diikuti isi section lengkap dan :::END_UPDATE::: untuk section yang benar-benar berubah. Jangan mengubah AC, Task, atau progress Kanban.`,
		user: input,
	};
}
