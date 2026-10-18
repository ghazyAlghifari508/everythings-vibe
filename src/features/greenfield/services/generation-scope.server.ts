// Shared pre-flight for the AC and Task generation endpoints.
//
// Both stages run the same gate before any model call: plan entitlement, rate
// limit, project ownership, feature-tree SSOT, and repository context. Keeping
// it in one module means the fail-closed rules (an existing-codebase project
// never silently falls back to generic greenfield context) cannot drift
// between stages.
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { codebaseSnapshots, projects, subscriptions } from "@/db/schema";
import {
	type EffectiveSubscription,
	resolveSubscriptionState,
} from "@/features/billing/services/billing";
import { hasFullWorkflow } from "@/features/billing/services/credits";
import {
	buildCodebasePromptBlock,
	requireProjectGenerationContext,
	type SnapshotGenerationContext,
} from "@/features/codebase/services/generation-context";
import {
	FEATURE_TREE_MISSING_MESSAGE,
	featureTreeSchema,
	formatFeatureTreeBlock,
} from "@/features/greenfield/services/feature-service";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Plan } from "@/types/database";
import { availableCredits } from "./generation-credit.server";

export interface GenerationRequestInput {
	projectId?: string;
	clientIdempotencyKey?: string;
	attempt?: number;
}

export async function parseGenerationRequest(
	request: Request,
): Promise<GenerationRequestInput> {
	const raw = await request.json().catch(() => null);
	const body =
		typeof raw === "object" && raw !== null
			? Object.fromEntries(Object.entries(raw))
			: {};
	return {
		projectId: typeof body.projectId === "string" ? body.projectId : undefined,
		clientIdempotencyKey:
			typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
		attempt: typeof body.attempt === "number" ? body.attempt : undefined,
	};
}

export interface GenerationScope {
	userId: string;
	plan: Plan;
	effective: EffectiveSubscription;
	availableCredits: number;
	project: {
		id: string;
		language: string | null;
		projectMode: string | null;
	};
	featureTreeBlock: string;
	/** Subfeature ids a task may anchor to; the task stage validates against it. */
	validSubfeatureIds: ReadonlySet<string>;
	codebaseBlock: string;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
	/** Ready repository analysis; null for greenfield. */
	generationContext: SnapshotGenerationContext | null;
}

export type GenerationScopeResult =
	| { ok: false; response: Response }
	| { ok: true; data: GenerationScope };

function refuse(response: Response): GenerationScopeResult {
	return { ok: false, response };
}

export async function resolveGenerationScope(input: {
	userId: string;
	projectId: string;
	upgradeMessage: string;
}): Promise<GenerationScopeResult> {
	const { userId, projectId } = input;

	const [sub] = await db
		.select({
			plan: subscriptions.plan,
			status: subscriptions.status,
			credits: subscriptions.credits,
			creditsUsed: subscriptions.creditsUsed,
			creditsReserved: subscriptions.creditsReserved,
			currentPeriodStart: subscriptions.currentPeriodStart,
			currentPeriodEnd: subscriptions.currentPeriodEnd,
			cancelledAt: subscriptions.cancelledAt,
		})
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const effective = resolveSubscriptionState(sub, new Date());

	if (!hasFullWorkflow(effective.effectivePlan)) {
		return refuse(
			Response.json(
				{
					error: input.upgradeMessage,
					code: "UPGRADE_REQUIRED",
					plan: effective.effectivePlan,
				},
				{ status: 403 },
			),
		);
	}

	const rateCheck = await checkRateLimit(
		userId,
		effective.effectivePlan,
		"api_call",
	);
	if (!rateCheck.allowed) {
		return refuse(
			Response.json(
				{ error: "Too many requests", retryAfter: 60 },
				{ status: 429 },
			),
		);
	}

	const [project] = await db
		.select({
			id: projects.id,
			language: projects.language,
			projectMode: projects.projectMode,
			featureTree: projects.featureTree,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);
	if (!project) {
		return refuse(
			Response.json({ error: "Project not found" }, { status: 404 }),
		);
	}

	// Fitur SSOT: every AC chapter and every task anchors to a tree
	// feature/subfeature. Fail closed with an actionable message instead of
	// generating from the PRD alone and drifting out of sync.
	const parsedTree = featureTreeSchema.safeParse(project.featureTree);
	if (!parsedTree.success) {
		return refuse(
			Response.json(
				{ error: FEATURE_TREE_MISSING_MESSAGE, code: "FEATURE_TREE_MISSING" },
				{ status: 409 },
			),
		);
	}

	const scope: GenerationScope = {
		userId,
		plan: effective.effectivePlan,
		effective,
		availableCredits: availableCredits(sub),
		project: {
			id: project.id,
			language: project.language,
			projectMode: project.projectMode,
		},
		featureTreeBlock: formatFeatureTreeBlock(parsedTree.data),
		validSubfeatureIds: new Set(
			parsedTree.data.features.flatMap((feature) =>
				feature.subfeatures.map((sub) => sub.id),
			),
		),
		codebaseBlock: "",
		generationContext: null,
	};

	if (project.projectMode === "existing_codebase") {
		try {
			// Fail closed: a repository-aware stage must never be generated from
			// generic greenfield context.
			const required = await requireProjectGenerationContext(projectId);
			if ("code" in required) {
				return refuse(Response.json(required, { status: required.status }));
			}
			const generationContext = required.context;
			if (generationContext) {
				scope.codebaseBlock = buildCodebasePromptBlock(generationContext);
				scope.generationContext = generationContext;
				scope.codebaseSnapshotId = generationContext.snapshotId;
				scope.codebaseAnalysisId = generationContext.analysisId ?? undefined;
				const [snapshot] = await db
					.select({
						fileCount: codebaseSnapshots.fileCount,
						contentSize: codebaseSnapshots.contentSize,
					})
					.from(codebaseSnapshots)
					.where(eq(codebaseSnapshots.id, generationContext.snapshotId))
					.limit(1);
				if (snapshot) {
					scope.codebaseSnapshotInfo = {
						fileCount: snapshot.fileCount,
						sourceBytes: snapshot.contentSize,
					};
				}
			}
		} catch {
			/* optional context must never block generation */
		}
	}

	return { ok: true, data: scope };
}
