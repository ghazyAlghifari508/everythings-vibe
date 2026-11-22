import { and, eq } from "drizzle-orm";
import type { CreditTransaction } from "@/features/billing/services/credit-db";
import { getDatabase } from "@/features/billing/services/credit-db";
import {
	type CreditFundingSource,
	type CreditOperationProduct,
	type CreditResourceType,
	getCreditOperationDefinition,
} from "@/features/billing/services/credit-operation-registry";
import type { ReserveCreditOperationInput } from "@/features/billing/types/credit-contracts";

export interface ResolvedCreditResource {
	resourceType: CreditResourceType;
	product: CreditOperationProduct;
	projectId: string | null;
	studioProjectId: string | null;
	studioJobId: string | null;
	scrapeId: string | null;
}

const OWNERSHIP_ERROR = "Credit operation ownership mismatch";

/**
 * Validates the billed resource against the operation registry and proves
 * the user owns it. Every lookup is scoped by user_id; the composite FKs on
 * credit_operations enforce the same ownership again at the database.
 */
export async function resolveCreditResource(
	tx: CreditTransaction,
	input: ReserveCreditOperationInput,
): Promise<ResolvedCreditResource> {
	const { schema } = await getDatabase();
	const definition = getCreditOperationDefinition(input.operation);
	const resourceType = input.resourceType ?? "plan_project";
	if (definition.resourceType !== resourceType)
		throw new Error("Credit operation resource type mismatch");
	if (definition.stage !== input.stage)
		throw new Error("Credit operation stage mismatch");

	if (input.resourceType === "studio_project") {
		const [job] = await tx
			.select({ jobType: schema.studioJobs.jobType })
			.from(schema.studioJobs)
			.where(
				and(
					eq(schema.studioJobs.id, input.studioJobId),
					eq(schema.studioJobs.projectId, input.studioProjectId),
					eq(schema.studioJobs.userId, input.userId),
				),
			)
			.limit(1);
		if (!job) throw new Error(OWNERSHIP_ERROR);
		if (
			definition.source.table !== "studio_jobs" ||
			job.jobType !== definition.source.jobType
		)
			throw new Error("Credit operation resource type mismatch");
		const [project] = await tx
			.select({ id: schema.studioProjects.id })
			.from(schema.studioProjects)
			.where(
				and(
					eq(schema.studioProjects.id, input.studioProjectId),
					eq(schema.studioProjects.userId, input.userId),
				),
			)
			.limit(1);
		if (!project) throw new Error(OWNERSHIP_ERROR);
		return {
			resourceType,
			product: "studio",
			projectId: null,
			studioProjectId: input.studioProjectId,
			studioJobId: input.studioJobId,
			scrapeId: null,
		};
	}

	if (input.resourceType === "scrape") {
		const [scrape] = await tx
			.select({ mode: schema.scrapes.mode })
			.from(schema.scrapes)
			.where(
				and(
					eq(schema.scrapes.id, input.scrapeId),
					eq(schema.scrapes.userId, input.userId),
				),
			)
			.limit(1);
		if (!scrape) throw new Error(OWNERSHIP_ERROR);
		if (
			definition.source.table !== "scrapes" ||
			scrape.mode !== definition.source.mode
		)
			throw new Error("Credit operation resource type mismatch");
		return {
			resourceType,
			product: "scrape",
			projectId: null,
			studioProjectId: null,
			studioJobId: null,
			scrapeId: input.scrapeId,
		};
	}

	const [project] = await tx
		.select({
			id: schema.projects.id,
			projectMode: schema.projects.projectMode,
		})
		.from(schema.projects)
		.where(
			and(
				eq(schema.projects.id, input.projectId),
				eq(schema.projects.userId, input.userId),
			),
		)
		.limit(1);
	if (!project) throw new Error(OWNERSHIP_ERROR);
	// Verified project data decides the family, never the caller.
	const product =
		project.projectMode === "existing_codebase"
			? "vibeplan_codebase"
			: project.projectMode === "greenfield"
				? "vibeplan_greenfield"
				: null;
	if (!product) throw new Error("Credit operation project mode unsupported");
	return {
		resourceType,
		product,
		projectId: project.id,
		studioProjectId: null,
		studioJobId: null,
		scrapeId: null,
	};
}

export function resolveFundingSource(input: {
	isExempt: boolean;
	initialAnalysisAllowance: boolean;
}): CreditFundingSource {
	if (input.isExempt) return "exempt";
	return input.initialAnalysisAllowance
		? "initial_analysis_allowance"
		: "subscription_balance";
}

/**
 * One idempotency key is one logical operation: a reused key must point at
 * the same kind and resource, otherwise it would hand back (and bill) an
 * unrelated operation.
 */
export function assertSameOperationIdentity(
	existing: {
		kind: string;
		projectId: string | null;
		studioProjectId: string | null;
		studioJobId: string | null;
		scrapeId: string | null;
	},
	input: { operation: string; resource: ResolvedCreditResource },
): void {
	if (
		existing.kind !== input.operation ||
		existing.projectId !== input.resource.projectId ||
		existing.studioProjectId !== input.resource.studioProjectId ||
		existing.studioJobId !== input.resource.studioJobId ||
		existing.scrapeId !== input.resource.scrapeId
	)
		throw new Error("Credit operation idempotency key identity mismatch");
}
