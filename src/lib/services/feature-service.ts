/**
 * Fitur stage service: parse/validate/persist ProjectFeatureTree + SSOT grounding.
 * Fitur adalah daftar gliederung terstruktur (features → subfeatures) yang menjadi
 * satu-satunya sumber daftar fitur untuk PRD Bab 4-5, AC, dan Task.
 */

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type ProjectFeatureTree, projects } from "@/db/schema";
import { advanceStep } from "@/lib/flow-progress";

const MAX_PRODUCT_NAME_CHARS = 200;
const MAX_FEATURE_NAME_CHARS = 120;
const MAX_FEATURE_DESC_CHARS = 2000;
const MAX_FEATURES = 20;
const MAX_SUBFEATURES = 5;
const MIN_SUBFEATURES = 2;

const featureIdSchema = z.string().regex(/^feat-\d+$/, "ID fitur harus feat-N");
const subfeatureIdSchema = z
	.string()
	.regex(/^subfeat-\d+\.\d+$/, "ID subfitur harus subfeat-N.M");

const subfeatureNodeSchema = z.object({
	id: subfeatureIdSchema,
	name: z.string().trim().min(1).max(MAX_FEATURE_NAME_CHARS),
	description: z.string().trim().min(1).max(MAX_FEATURE_DESC_CHARS),
});

const featureNodeSchema = z.object({
	id: featureIdSchema,
	name: z.string().trim().min(1).max(MAX_FEATURE_NAME_CHARS),
	phase: z.number().int().min(1).max(3),
	description: z.string().trim().min(1).max(MAX_FEATURE_DESC_CHARS),
	subfeatures: z
		.array(subfeatureNodeSchema)
		.min(MIN_SUBFEATURES)
		.max(MAX_SUBFEATURES),
});

export const featureTreeSchema = z.object({
	productName: z.string().trim().min(1).max(MAX_PRODUCT_NAME_CHARS),
	features: z.array(featureNodeSchema).min(1).max(MAX_FEATURES),
	createdAt: z
		.string()
		.min(1)
		.default(() => new Date().toISOString()),
});

/**
 * Strict parse of LLM JSON into ProjectFeatureTree. Rebuilds a validated tree
 */
export function parseFeatureTreeJson(
	jsonString: string,
): ProjectFeatureTree | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonString);
	} catch {
		return null;
	}
	const result = featureTreeSchema.safeParse(parsed);
	if (!result.success) return null;
	const tree = result.data;
	const featureNumbers = new Set<string>();
	const subfeatureIds = new Set<string>();
	for (const feature of tree.features) {
		const featureNum = feature.id.slice("feat-".length);
		if (featureNumbers.has(featureNum)) return null;
		featureNumbers.add(featureNum);
		for (const sub of feature.subfeatures) {
			if (subfeatureIds.has(sub.id)) return null;
			subfeatureIds.add(sub.id);
			if (!sub.id.startsWith(`subfeat-${featureNum}.`)) return null;
		}
	}
	return tree;
}

/** Thrown when the project does not exist or belongs to another tenant. */
export class FeatureProjectNotFoundError extends Error {
	readonly code = "FEATURE_PROJECT_NOT_FOUND" as const;

	constructor() {
		super("Project not found");
		this.name = "FeatureProjectNotFoundError";
	}
}

/**
 * Persist a validated tree. Ownership, the write, and the forward-only step
 * advance run in one transaction with the project row locked, so a concurrent
 * writer can neither write into a foreign project nor rewind the step.
 */
export async function saveFeatureTree(
	projectId: string,
	userId: string,
	tree: ProjectFeatureTree,
): Promise<void> {
	await db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id, step: projects.step })
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
		if (!project) throw new FeatureProjectNotFoundError();
		const updateData: {
			featureTree: ProjectFeatureTree;
			featuresStatus: string;
			updatedAt: Date;
			step?: string;
		} = {
			featureTree: tree,
			featuresStatus: "completed",
			updatedAt: new Date(),
		};
		const next = advanceStep(project.step, "fitur");
		if (next) updateData.step = next;
		await tx.update(projects).set(updateData).where(eq(projects.id, projectId));
	});
}

export interface SubfeatureRef {
	featureId: string;
	featureName: string;
	subfeatureId: string;
	subfeatureName: string;
}

export function collectSubfeatureRefs(
	tree: ProjectFeatureTree,
): Map<string, SubfeatureRef> {
	const out = new Map<string, SubfeatureRef>();
	for (const feature of tree.features) {
		for (const sub of feature.subfeatures) {
			out.set(sub.id, {
				featureId: feature.id,
				featureName: feature.name,
				subfeatureId: sub.id,
				subfeatureName: sub.name,
			});
		}
	}
	return out;
}

/** Subfeature ids with no entry in the tree. Empty means fully grounded. */
export function findUnknownSubfeatureIds(
	ids: string[],
	tree: ProjectFeatureTree,
): string[] {
	const known = collectSubfeatureRefs(tree);
	return [...new Set(ids)].filter((id) => !known.has(id));
}

/** Actionable 409 message shared by PRD/AC/Task when the tree is absent. */
export const FEATURE_TREE_MISSING_MESSAGE =
	"Daftar fitur belum dibuat. Buka halaman Fitur dan generate daftar fitur terlebih dahulu sebelum lanjut ke tahap ini.";

/**
 * SSOT grounding block injected into PRD/AC/Task prompts. Declares the tree
 * 1:1 — downstream stages must not invent, drop, or rename entries.
 */
export function formatFeatureTreeBlock(tree: ProjectFeatureTree): string {
	const lines: string[] = [
		"--- DAFTAR FITUR & SUBFITUR WAJIB (SSOT) ---",
		`Produk: ${tree.productName}`,
		"DAFTAR FITUR & SUBFITUR WAJIB: gunakan struktur 1:1 untuk Bab 4-5. DILARANG mengubah/menghapus/membuat fitur baru di luar struktur ini.",
	];
	const byPhase = new Map<number, typeof tree.features>();
	for (const feature of tree.features) {
		const group = byPhase.get(feature.phase) ?? [];
		group.push(feature);
		byPhase.set(feature.phase, group);
	}
	for (const phase of [...byPhase.keys()].sort((a, b) => a - b)) {
		lines.push(`Fase ${phase}:`);
		for (const feature of byPhase.get(phase) ?? []) {
			lines.push(`- ${feature.id} ${feature.name}: ${feature.description}`);
			for (const sub of feature.subfeatures) {
				lines.push(`  - ${sub.id} ${sub.name}: ${sub.description}`);
			}
		}
	}
	lines.push("--- AKHIR DAFTAR FITUR ---");
	return lines.join("\n");
}
