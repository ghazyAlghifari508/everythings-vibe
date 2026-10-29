import { featureTreeSchema } from "@/features/greenfield/services/feature-service";
import { parseTaskJson } from "@/features/greenfield/services/task-tree";
import { extractJson } from "@/lib/services/json-extract";
import { revisionRequestSchema } from "../types/revision";
import { generatePrdRevisionProposal } from "./revision-propose";
import type { ReconciliationItem } from "./revision-reconciliation";
import { reconcileTasks } from "./revision-reconciliation";
import type { resolveRevisionSource } from "./revision-source.server";

type Generator = Parameters<typeof generatePrdRevisionProposal>[1];

export async function proposeRevision(
	userId: string,
	input: unknown,
	resolve: typeof resolveRevisionSource,
	generate: Generator,
) {
	const parsed = revisionRequestSchema.safeParse(input);
	if (!parsed.success)
		return { kind: "source_error" as const, code: "INVALID_REQUEST" as const };
	const request = parsed.data;

	const source = await resolve(userId, request);
	if (!source.ok) return { kind: "source_error" as const, code: source.code };

	let proposalResult:
		| {
				kind: "proposal";
				content: string;
				sections?: string[];
				reconciliation?: ReconciliationItem[];
		  }
		| { kind: "conflict"; explanation: string }
		| { kind: "invalid" };

	if (request.targetArtifactKind === "prd") {
		proposalResult = await generatePrdRevisionProposal(
			{
				instruction: request.userInstruction,
				base: source.content,
				analysis: source.analysis,
				references: source.references,
				upstream: source.upstream,
				dependencies: source.dependencies,
			},
			generate,
		);
	} else if (request.targetArtifactKind === "ac") {
		const prompt = {
			system:
				"Anda menyusun usulan revisi Acceptance Criteria. Ikuti instruksi secara tepat. Pertahankan kriteria lain yang tidak diminta untuk berubah.",
			user: {
				instruction: request.userInstruction,
				base: source.content,
				upstreamPrd: source.upstream.prd?.content,
			},
		};
		const res = await generate([
			{ role: "system", content: prompt.system },
			{ role: "user", content: JSON.stringify(prompt.user) },
		]);
		if (
			!res.text ||
			res.finishReason === "aborted" ||
			res.text === source.content
		) {
			proposalResult = { kind: "invalid" };
		} else {
			proposalResult = { kind: "proposal", content: res.text };
		}
	} else if (request.targetArtifactKind === "feature") {
		const prompt = {
			system:
				"Anda menyusun usulan revisi Feature Tree. Format output WAJIB JSON yang valid sesuai schema ProjectFeatureTree.",
			user: {
				instruction: request.userInstruction,
				baseTree: source.content,
			},
		};
		const res = await generate([
			{ role: "system", content: prompt.system },
			{ role: "user", content: JSON.stringify(prompt.user) },
		]);
		if (!res.text || res.finishReason === "aborted") {
			proposalResult = { kind: "invalid" };
		} else {
			try {
				const json = extractJson(res.text);
				const parsedTree = featureTreeSchema.safeParse(JSON.parse(json));
				if (
					!parsedTree.success ||
					JSON.stringify(parsedTree.data) === source.content
				) {
					proposalResult = { kind: "invalid" };
				} else {
					proposalResult = {
						kind: "proposal",
						content: JSON.stringify(parsedTree.data),
					};
				}
			} catch {
				proposalResult = { kind: "invalid" };
			}
		}
	} else if (request.targetArtifactKind === "tasks") {
		const prompt = {
			system:
				"Anda menyusun usulan revisi Task Breakdown. Format output WAJIB JSON yang valid sesuai TaskTree format.",
			user: {
				instruction: request.userInstruction,
				baseTasks: source.content,
				acContext: source.dependencies.ac?.content,
			},
		};
		const res = await generate([
			{ role: "system", content: prompt.system },
			{ role: "user", content: JSON.stringify(prompt.user) },
		]);
		if (!res.text || res.finishReason === "aborted") {
			proposalResult = { kind: "invalid" };
		} else {
			try {
				const json = extractJson(res.text);
				const parsedTree = parseTaskJson(json);
				if (!parsedTree) {
					proposalResult = { kind: "invalid" };
				} else {
					const existingTasks = source.dependencies.tasks;
					const reconciled = reconcileTasks(existingTasks, parsedTree);
					proposalResult = {
						kind: "proposal",
						content: JSON.stringify(parsedTree),
						reconciliation: reconciled.items,
					};
				}
			} catch {
				proposalResult = { kind: "invalid" };
			}
		}
	} else {
		return { kind: "unsupported" as const };
	}

	if (proposalResult.kind === "invalid") return proposalResult;

	// Re-verify that source has not changed concurrently during generation
	const latest = await resolve(userId, request);
	if (!latest.ok) return { kind: "source_error" as const, code: latest.code };
	if (JSON.stringify(latest) !== JSON.stringify(source))
		return { kind: "source_error" as const, code: "SOURCE_CHANGED" as const };

	return proposalResult.kind === "proposal"
		? { ...proposalResult, base: source.content, impact: source.impact }
		: proposalResult;
}

export const proposePrdRevision = proposeRevision;
