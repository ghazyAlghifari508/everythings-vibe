import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { type ScrapeDocumentRow, scrapeDocuments, scrapes } from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { getScrapeById } from "./scrape-detail-service";

export const MAX_ENRICHMENT_ATTEMPTS = 2;

export interface EnrichmentRetryInput {
	enrichment: "applied" | "unavailable" | undefined;
	hasDocument: boolean;
	hasEvidence: boolean;
	attempts?: number;
	maxAttempts?: number;
}

export type EnrichmentRetryDecision =
	| { proceed: true }
	| { proceed: false; mode: "replay" | "missing-evidence" | "exhausted" };

// Decides an AI-only enrichment retry from persisted state, without touching
// the network. Applied enrichment replays the stored document; a retry without
// persisted evidence is refused instead of fabricating one. Retries are strictly
// bounded to prevent infinite recovery loops.
export function resolveEnrichmentRetry(
	input: EnrichmentRetryInput,
): EnrichmentRetryDecision {
	if (!input.hasEvidence) return { proceed: false, mode: "missing-evidence" };
	if (input.enrichment === "applied" && input.hasDocument)
		return { proceed: false, mode: "replay" };
	const limit = input.maxAttempts ?? MAX_ENRICHMENT_ATTEMPTS;
	if (input.attempts !== undefined && input.attempts >= limit) {
		return { proceed: false, mode: "exhausted" };
	}
	return { proceed: true };
}

// Concurrent AI-only retries for one scrape share a single run, so parallel
// clicks or double-mounted components cannot stack duplicate generations.
const enrichmentRetryInflight = new Map<string, Promise<ScrapeDocumentRow>>();

// Retries only the AI synthesis step from persisted evidence, without
// recapturing the website and without charging new credits: no billing path is
// touched here. A failed retry retains the stored document and only updates
// the enrichment status; a successful retry stores the document, the model
// version and the status atomically in one transaction.
export async function retryDesignSynthesis(
	scrapeId: string,
	userId: string,
): Promise<ScrapeDocumentRow> {
	const running = enrichmentRetryInflight.get(scrapeId);
	if (running) return running;
	const task = runEnrichmentRetry(scrapeId, userId).finally(() => {
		if (enrichmentRetryInflight.get(scrapeId) === task)
			enrichmentRetryInflight.delete(scrapeId);
	});
	enrichmentRetryInflight.set(scrapeId, task);
	return task;
}

async function runEnrichmentRetry(
	scrapeId: string,
	userId: string,
): Promise<ScrapeDocumentRow> {
	const scrape = await getScrapeById(scrapeId, userId);
	const evidence = scrape.metadata?.visualEvidence;
	const attempts = scrape.metadata?.aiEnrichmentAttempts ?? 0;
	const decision = resolveEnrichmentRetry({
		enrichment: scrape.metadata?.aiEnrichment,
		hasDocument: scrape.document !== null,
		hasEvidence: evidence !== undefined,
		attempts,
	});
	if (!decision.proceed) {
		if (decision.mode === "replay" && scrape.document) return scrape.document;
		if (decision.mode === "exhausted")
			throw new ScrapeError(
				"RETRY_EXHAUSTED",
				"Batas percobaan pemulihan telah tercapai.",
			);
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tersimpan tidak tersedia untuk retry.",
		);
	}
	if (!evidence)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tersimpan tidak tersedia untuk retry.",
		);
	// An AI-only retry consumes a real generation slot, so it respects the same
	// request rate limit as creating a new scrape instead of bypassing it.
	const { checkRateLimit } = await import("@/lib/rate-limit");
	if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
		throw new ScrapeError(
			"RATE_LIMITED",
			"Batas request tercapai. Coba lagi setelah satu menit.",
		);
	const { generateDesignMd } = await import("./prompts-design-md");
	const generated = await generateDesignMd(
		evidence,
		{
			onActivity: async () => {},
			onTiming: () => {},
		},
		undefined,
		{ title: scrape.title ?? undefined },
	);
	const nextAttempts = attempts + 1;
	return db.transaction(async (tx) => {
		if (generated.enrichment.status === "applied") {
			const [inserted] = await tx
				.insert(scrapeDocuments)
				.values({ scrapeId, designMd: generated.document })
				.returning();
			if (!inserted) throw new ScrapeError("STORAGE_FAILED");
			await tx
				.update(scrapes)
				.set({
					metadata: {
						...scrape.metadata,
						aiEnrichment: "applied",
						aiEnrichmentDetail: undefined,
						aiEnrichmentAttempts: nextAttempts,
						designModelVersion: generated.model.version,
					},
					updatedAt: new Date(),
				})
				.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)));
			return inserted;
		}
		await tx
			.update(scrapes)
			.set({
				metadata: {
					...scrape.metadata,
					aiEnrichment: "unavailable",
					aiEnrichmentDetail: generated.enrichment.detail,
					aiEnrichmentAttempts: nextAttempts,
					designModelVersion: generated.model.version,
				},
				updatedAt: new Date(),
			})
			.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)));
		const [current] = await tx
			.select()
			.from(scrapeDocuments)
			.where(eq(scrapeDocuments.scrapeId, scrapeId))
			.orderBy(desc(scrapeDocuments.createdAt))
			.limit(1);
		if (current) return current;
		// No stored document exists yet: keep the measurement-only fallback as
		// the first version instead of leaving the retry empty-handed.
		const [inserted] = await tx
			.insert(scrapeDocuments)
			.values({ scrapeId, designMd: generated.document })
			.returning();
		if (!inserted) throw new ScrapeError("STORAGE_FAILED");
		return inserted;
	});
}
