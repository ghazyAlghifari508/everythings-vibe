import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
	applyMigrations,
	createIsolatedDatabase,
	ISOLATED_ADMIN_URL,
	PRE_UNIVERSAL_MIGRATION,
} from "./support/isolated-credit-db";

// Everything below runs on a disposable database created by this file.
// DATABASE_URL is poisoned, and every pg Pool built from it (the app's own
// `@/db` pool, however and whenever it is imported) is redirected to the
// disposable database. Pools with an explicit URL pass through untouched.
const state = vi.hoisted(() => {
	process.env.DATABASE_URL = "postgresql://nobody@127.0.0.1:1/unreachable";
	return { url: null as string | null };
});
vi.mock("pg", async (importOriginal) => {
	const original = await importOriginal<typeof import("pg")>();
	class RedirectedPool extends original.Pool {
		constructor(config?: ConstructorParameters<typeof original.Pool>[0]) {
			super(
				config?.connectionString ===
					"postgresql://nobody@127.0.0.1:1/unreachable"
					? {
							connectionString:
								state.url ?? "postgresql://nobody@127.0.0.1:1/unset",
						}
					: config,
			);
		}
	}
	return {
		...original,
		default: { ...original, Pool: RedirectedPool },
		Pool: RedirectedPool,
	};
});
// Studio/Scrape tariffs are intentionally unconfigured in production. This
// test-only tariff lets the accounting path run for those product families.
vi.mock(
	"@/features/billing/services/credit-operation-registry",
	async (importOriginal) => {
		const original =
			await importOriginal<
				typeof import("@/features/billing/services/credit-operation-registry")
			>();
		const testPricing = (kind: string) =>
			kind === "studio.generate"
				? ({
						status: "configured",
						mode: "fixed",
						version: "adaptive-v1",
						credits: 3,
					} as const)
				: kind === "scrape.crawl"
					? ({
							status: "configured",
							mode: "fixed",
							version: "adaptive-v1",
							credits: 4,
						} as const)
					: null;
		return {
			...original,
			requireConfiguredPricing: (
				kind: Parameters<typeof original.requireConfiguredPricing>[0],
			) => testPricing(kind) ?? original.requireConfiguredPricing(kind),
		};
	},
);

const enabled = Boolean(ISOLATED_ADMIN_URL);

describe.skipIf(!enabled)("universal credit ledger (isolated database)", () => {
	let pool: Pool;
	let drop: () => Promise<void>;
	let legacy: {
		userId: string;
		ops: Record<string, string>;
		before: Record<string, Record<string, unknown>>;
	};

	const q = async (text: string, values: unknown[] = []) =>
		(await pool.query(text, values)).rows;

	beforeAll(async () => {
		if (!ISOLATED_ADMIN_URL) return;
		const database = await createIsolatedDatabase(ISOLATED_ADMIN_URL);
		drop = database.drop;
		await applyMigrations(database.url, { through: PRE_UNIVERSAL_MIGRATION });
		pool = new Pool({ connectionString: database.url });
		state.url = database.url;

		// Legacy fixtures written with the pre-0045 column set.
		const userId = crypto.randomUUID();
		await q(`INSERT INTO users (id, email) VALUES ($1, $2)`, [
			userId,
			`${userId}@example.test`,
		]);
		await q(
			`INSERT INTO subscriptions (id, user_id, plan, credits, credits_used, credits_reserved) VALUES ('legacy-sub', $1, 'pro', 30, 5, 0)`,
			[userId],
		);
		const projects: Record<string, [string, string]> = {
			green: ["greenfield", "g"],
			code: ["existing_codebase", "c"],
		};
		for (const [key, [mode]] of Object.entries(projects))
			await q(
				`INSERT INTO projects (id, user_id, name, project_mode) VALUES ($1, $2, $3, $4)`,
				[`legacy-${key}`, userId, key, mode],
			);
		const insertOp = (
			id: string,
			projectId: string,
			kind: string,
			stage: string,
			state: string,
			extra: { exempt?: boolean; allowance?: boolean; sub?: boolean } = {},
			metrics = "{}",
		) =>
			q(
				`INSERT INTO credit_operations (id, user_id, project_id, subscription_id, kind, stage, idempotency_key, state, estimated_credits, reserved_credits, maximum_credits, final_charge, pricing_version, metrics, is_exempt, initial_analysis_allowance)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,2,0,4,$9,'adaptive-v1',$10::jsonb,$11,$12)`,
				[
					id,
					userId,
					projectId,
					extra.sub === false ? null : "legacy-sub",
					kind,
					stage,
					`legacy-key-${id}`,
					state,
					state === "settled" ? 2 : null,
					metrics,
					extra.exempt ?? false,
					extra.allowance ?? false,
				],
			);
		await insertOp(
			"op-green",
			"legacy-green",
			"prd_generation",
			"prd",
			"settled",
		);
		await insertOp(
			"op-code",
			"legacy-code",
			"prd_generation",
			"prd",
			"settled",
		);
		await insertOp(
			"op-analysis",
			"legacy-code",
			"codebase_analysis",
			"codebase",
			"settled",
		);
		await insertOp(
			"op-ambiguous",
			"legacy-green",
			"prd_generation",
			"prd",
			"settled",
			{},
			'{"hasCodebaseContext": true}',
		);
		await insertOp(
			"op-exempt",
			"legacy-green",
			"ac_generation",
			"ac",
			"settled",
			{
				exempt: true,
			},
		);
		await insertOp(
			"op-allowance",
			"legacy-code",
			"codebase_analysis",
			"codebase",
			"released",
			{ allowance: true },
		);
		await insertOp(
			"op-unbound",
			"legacy-green",
			"task_generation",
			"task",
			"released",
			{
				sub: false,
			},
		);
		await q(
			`INSERT INTO credit_ledger_entries (id, user_id, operation_id, amount, entry_type, source_category, pricing_version, metadata) VALUES ('legacy-ledger', $1, 'op-green', -2, 'debit', 'adaptive_credit', 'adaptive-v1', '{}')`,
			[userId],
		);
		const rows = await q(
			`SELECT id, user_id, project_id, kind, stage, state, estimated_credits, reserved_credits, maximum_credits, final_charge, pricing_version, idempotency_key, created_at FROM credit_operations`,
		);
		const before: Record<string, Record<string, unknown>> = {};
		for (const row of rows) before[row.id as string] = row;
		legacy = {
			userId,
			ops: {},
			before,
		};
		await applyMigrations(database.url, { after: PRE_UNIVERSAL_MIGRATION });
	}, 120_000);

	afterAll(async () => {
		// Close the app's own pool first so dropping the database is quiet.
		const { db: appDb } = await import("@/db");
		await appDb.$client.end();
		await pool?.end();
		await drop?.();
	});

	it("routes every service query to the disposable database", async () => {
		const { db } = await import("@/db");
		const result = await db.execute(sql`SELECT current_database() AS name`);
		const [row] = await q(`SELECT current_database() AS name`);
		expect(result.rows[0]).toEqual(row);
		expect(String(row.name)).toMatch(/^credit_iso_/);
	});

	describe("migration preservation", () => {
		it("keeps every historical operation field untouched", async () => {
			const rows = await q(
				`SELECT id, user_id, project_id, kind, stage, state, estimated_credits, reserved_credits, maximum_credits, final_charge, pricing_version, idempotency_key, created_at FROM credit_operations`,
			);
			expect(rows).toHaveLength(Object.keys(legacy.before).length);
			for (const row of rows) expect(row).toEqual(legacy.before[row.id]);
			const [sub] = await q(
				`SELECT credits, credits_used, credits_reserved, allocation_epoch FROM subscriptions WHERE id = 'legacy-sub'`,
			);
			expect(sub).toEqual({
				credits: 30,
				credits_used: 5,
				credits_reserved: 0,
				allocation_epoch: 0,
			});
			const ledger = await q(
				`SELECT amount FROM credit_ledger_entries WHERE id = 'legacy-ledger'`,
			);
			expect(ledger).toEqual([{ amount: -2 }]);
		});

		it("classifies from evidence and labels ambiguity as legacy_unknown", async () => {
			const rows = await q(
				`SELECT id, resource_type, product, funding_source, subscription_epoch FROM credit_operations`,
			);
			const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
			expect(byId["op-green"]).toMatchObject({
				resource_type: "plan_project",
				product: "vibeplan_greenfield",
				funding_source: "subscription_balance",
				subscription_epoch: 0,
			});
			expect(byId["op-code"].product).toBe("vibeplan_codebase");
			expect(byId["op-analysis"].product).toBe("vibeplan_codebase");
			expect(byId["op-ambiguous"].product).toBe("legacy_unknown");
			expect(byId["op-exempt"].funding_source).toBe("exempt");
			expect(byId["op-allowance"].funding_source).toBe(
				"initial_analysis_allowance",
			);
			expect(byId["op-unbound"]).toMatchObject({
				funding_source: "legacy_unknown",
				subscription_epoch: null,
			});
		});

		it("keeps historical usage readable through the history reader", async () => {
			const { queryCreditUsageHistory } = await import(
				"@/features/billing/services/credit-usage.functions"
			);
			const result = await queryCreditUsageHistory(legacy.userId, {
				page: 1,
				pageSize: 50,
			});
			expect(result.total).toBe(Object.keys(legacy.before).length);
			expect(result.items.every((item) => item.projectId !== null)).toBe(true);
		});
	});

	// Fresh user per test; ledger rows are append-only so rows are never reused.
	async function fixture(opts: { credits?: number; plan?: string } = {}) {
		const userId = crypto.randomUUID();
		const db = drizzle(pool, { schema });
		await db
			.insert(schema.users)
			.values({ id: userId, email: `${userId}@x.test` });
		const [sub] = await db
			.insert(schema.subscriptions)
			.values({
				id: crypto.randomUUID(),
				userId,
				plan: opts.plan ?? "pro",
				credits: opts.credits ?? 10,
				currentPeriodStart: new Date(),
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			})
			.returning();
		const mkProject = async (mode: string) => {
			const id = crypto.randomUUID();
			await db
				.insert(schema.projects)
				.values({ id, userId, name: mode, projectMode: mode });
			return id;
		};
		const [studioProject] = await db
			.insert(schema.studioProjects)
			.values({ userId, title: "s" })
			.returning();
		const [studioJob] = await db
			.insert(schema.studioJobs)
			.values({
				projectId: studioProject.id,
				userId,
				prompt: "p",
				jobType: "initial",
			})
			.returning();
		const [scrape] = await db
			.insert(schema.scrapes)
			.values({
				userId,
				sourceUrl: "https://a.test",
				domain: "a.test",
				mode: "crawl",
			})
			.returning();
		return { userId, db, sub, mkProject, studioProject, studioJob, scrape };
	}

	async function services() {
		const credit = await import("@/lib/services/credit-service");
		const { estimateCreditQuote } = await import("@/lib/adaptive-credit");
		return { ...credit, estimateCreditQuote };
	}

	async function balance(subscriptionId: string) {
		const [row] = await q(
			`SELECT credits, credits_used, credits_reserved, allocation_epoch FROM subscriptions WHERE id = $1`,
			[subscriptionId],
		);
		return row as {
			credits: number;
			credits_used: number;
			credits_reserved: number;
			allocation_epoch: number;
		};
	}

	function planInput(
		f: Awaited<ReturnType<typeof fixture>>,
		svc: Awaited<ReturnType<typeof services>>,
		projectId: string,
		key: string,
		operation: "prd_generation" | "codebase_analysis" = "prd_generation",
	) {
		const quote = svc.estimateCreditQuote({ operation, metrics: {} });
		return {
			userId: f.userId,
			projectId,
			stage:
				operation === "prd_generation"
					? ("prd" as const)
					: ("codebase" as const),
			operation,
			metrics: {},
			idempotencyKey: key,
			quote,
			isExempt: false,
		};
	}

	describe("resource identity", () => {
		it("derives the product from verified project mode and stores resource columns", async () => {
			const f = await fixture({ credits: 40 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const code = await f.mkProject("existing_codebase");
			const a = await svc.reserveCreditOperation(
				planInput(f, svc, green, "k-green"),
			);
			const b = await svc.reserveCreditOperation(
				planInput(f, svc, code, "k-code"),
			);
			const rows = await q(
				`SELECT id, product, resource_type, project_id, studio_project_id, funding_source, subscription_epoch FROM credit_operations WHERE id IN ($1,$2)`,
				[a.id, b.id],
			);
			const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
			expect(byId[a.id]).toMatchObject({
				product: "vibeplan_greenfield",
				resource_type: "plan_project",
				project_id: green,
				studio_project_id: null,
				funding_source: "subscription_balance",
				subscription_epoch: 0,
			});
			expect(byId[b.id].product).toBe("vibeplan_codebase");
		});

		it("reserves Studio and Scrape against typed, validated resources", async () => {
			const f = await fixture();
			const svc = await services();
			const studio = await svc.reserveCreditOperation({
				userId: f.userId,
				resourceType: "studio_project",
				studioProjectId: f.studioProject.id,
				studioJobId: f.studioJob.id,
				stage: "studio",
				operation: "studio.generate",
				metrics: {},
				idempotencyKey: "studio-1",
				quote: svc.estimateCreditQuote({
					operation: "studio.generate",
					metrics: {},
				}),
				isExempt: false,
			});
			const scrape = await svc.reserveCreditOperation({
				userId: f.userId,
				resourceType: "scrape",
				scrapeId: f.scrape.id,
				stage: "scrape",
				operation: "scrape.crawl",
				metrics: {},
				idempotencyKey: "scrape-1",
				quote: svc.estimateCreditQuote({
					operation: "scrape.crawl",
					metrics: {},
				}),
				isExempt: false,
			});
			const rows = await q(
				`SELECT id, product, resource_type, project_id, studio_project_id, studio_job_id, scrape_id, reserved_credits FROM credit_operations WHERE id IN ($1,$2)`,
				[studio.id, scrape.id],
			);
			const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
			expect(byId[studio.id]).toMatchObject({
				product: "studio",
				project_id: null,
				studio_project_id: f.studioProject.id,
				studio_job_id: f.studioJob.id,
				reserved_credits: 3,
			});
			expect(byId[scrape.id]).toMatchObject({
				product: "scrape",
				scrape_id: f.scrape.id,
				reserved_credits: 4,
			});
			expect((await balance(f.sub.id)).credits_reserved).toBe(7);
		});

		it("rejects foreign-owned Studio and Scrape resources without side effects", async () => {
			const owner = await fixture();
			const attacker = await fixture();
			const svc = await services();
			const attempts = [
				{
					resourceType: "studio_project" as const,
					studioProjectId: owner.studioProject.id,
					studioJobId: owner.studioJob.id,
					stage: "studio" as const,
					operation: "studio.generate" as const,
				},
				{
					resourceType: "scrape" as const,
					scrapeId: owner.scrape.id,
					stage: "scrape" as const,
					operation: "scrape.crawl" as const,
				},
			];
			for (const attempt of attempts)
				await expect(
					svc.reserveCreditOperation({
						...attempt,
						userId: attacker.userId,
						metrics: {},
						idempotencyKey: `x-${attempt.operation}`,
						quote: svc.estimateCreditQuote({
							operation: attempt.operation,
							metrics: {},
						}),
						isExempt: false,
					}),
				).rejects.toThrow("Credit operation ownership mismatch");
			expect((await balance(attacker.sub.id)).credits_reserved).toBe(0);
			expect(
				await q(`SELECT 1 FROM credit_operations WHERE user_id = $1`, [
					attacker.userId,
				]),
			).toHaveLength(0);
		});

		it("rejects a job that belongs to a different project and a wrong operation for the job type", async () => {
			const f = await fixture();
			const other = await fixture();
			const svc = await services();
			const base = {
				userId: f.userId,
				resourceType: "studio_project" as const,
				stage: "studio" as const,
				metrics: {},
				isExempt: false,
			};
			await expect(
				svc.reserveCreditOperation({
					...base,
					studioProjectId: other.studioProject.id,
					studioJobId: f.studioJob.id,
					operation: "studio.generate",
					idempotencyKey: "cross-project",
					quote: svc.estimateCreditQuote({
						operation: "studio.generate",
						metrics: {},
					}),
				}),
			).rejects.toThrow("Credit operation ownership mismatch");
			await expect(
				svc.reserveCreditOperation({
					...base,
					studioProjectId: f.studioProject.id,
					studioJobId: f.studioJob.id,
					operation: "studio.revise",
					idempotencyKey: "wrong-type",
					quote: {
						operation: "studio.revise",
						pricingVersion: "adaptive-v1",
						estimatedCredits: 1,
						maximumCredits: 1,
						metrics: {},
					},
				}),
			).rejects.toThrow();
		});

		it("enforces ownership and shape in the database even for direct writes", async () => {
			const a = await fixture();
			const b = await fixture();
			const insert = (extra: string, values: unknown[]) =>
				q(
					`INSERT INTO credit_operations (id, user_id, resource_type, product, funding_source, kind, stage, idempotency_key, state, estimated_credits, maximum_credits, pricing_version, metrics, ${extra})
					 VALUES (gen_random_uuid()::text, $1, 'studio_project', 'studio', 'legacy_unknown', 'studio.generate', 'studio', gen_random_uuid()::text, 'quoted', 0, 0, 'adaptive-v1', '{}', ${values.map((_, i) => `$${i + 2}`).join(",")})`,
					[a.userId, ...values],
				);
			await expect(
				insert("studio_project_id", [b.studioProject.id]),
			).rejects.toThrow(/foreign key|violates/);
			await expect(
				insert("studio_project_id, studio_job_id", [
					a.studioProject.id,
					b.studioJob.id,
				]),
			).rejects.toThrow(/foreign key|violates/);
			await expect(
				q(
					`INSERT INTO credit_operations (id, user_id, resource_type, product, funding_source, kind, stage, idempotency_key, state, estimated_credits, maximum_credits, pricing_version, metrics) VALUES ('bad-shape', $1, 'studio_project', 'studio', 'legacy_unknown', 'studio.generate', 'studio', 'bad-shape', 'quoted', 0, 0, 'adaptive-v1', '{}')`,
					[a.userId],
				),
			).rejects.toThrow(/credit_operations_resource_check/);
		});

		it("blocks hard deletion of a billed Studio project", async () => {
			const f = await fixture();
			await q(
				`INSERT INTO credit_operations (id, user_id, resource_type, product, funding_source, kind, stage, idempotency_key, state, estimated_credits, maximum_credits, pricing_version, metrics, studio_project_id, studio_job_id)
				 VALUES ('billed-studio', $1, 'studio_project', 'studio', 'legacy_unknown', 'studio.generate', 'studio', 'billed-studio', 'quoted', 0, 0, 'adaptive-v1', '{}', $2, $3)`,
				[f.userId, f.studioProject.id, f.studioJob.id],
			);
			await expect(
				q(`DELETE FROM studio_jobs WHERE id = $1`, [f.studioJob.id]),
			).rejects.toThrow(/foreign key|violates/);
		});
	});

	describe("pricing gate", () => {
		it("never charges an unconfigured operation, even with a forged quote", async () => {
			const f = await fixture();
			const svc = await services();
			await expect(
				svc.reserveCreditOperation({
					userId: f.userId,
					resourceType: "scrape",
					scrapeId: f.scrape.id,
					stage: "scrape",
					operation: "scrape.crawl",
					metrics: {},
					idempotencyKey: "forged",
					quote: {
						operation: "scrape.crawl",
						pricingVersion: "adaptive-v1",
						estimatedCredits: 0,
						maximumCredits: 0,
						metrics: {},
					},
					isExempt: false,
				}),
			).rejects.toThrow("Credit quote does not match server pricing");
			const [imagesScrape] = await f.db
				.insert(schema.scrapes)
				.values({
					userId: f.userId,
					sourceUrl: "https://b.test",
					domain: "b.test",
					mode: "images",
				})
				.returning();
			await expect(
				svc.reserveCreditOperation({
					userId: f.userId,
					resourceType: "scrape",
					scrapeId: imagesScrape.id,
					stage: "scrape",
					operation: "scrape.images",
					metrics: {},
					idempotencyKey: "unconfigured",
					quote: {
						operation: "scrape.images",
						pricingVersion: "adaptive-v1",
						estimatedCredits: 0,
						maximumCredits: 0,
						metrics: {},
					},
					isExempt: false,
				}),
			).rejects.toThrow("Credit pricing is not configured for scrape.images");
			expect((await balance(f.sub.id)).credits_reserved).toBe(0);
			expect(
				await q(`SELECT 1 FROM credit_operations WHERE user_id = $1`, [
					f.userId,
				]),
			).toHaveLength(0);
		});
	});

	describe("shared accounting under concurrency", () => {
		it("never overspends the shared balance across feature families", async () => {
			const f = await fixture({ credits: 10 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const code = await f.mkProject("existing_codebase");
			const attempts = await Promise.allSettled([
				svc.reserveCreditOperation(planInput(f, svc, green, "c-prd")), // 8
				svc.reserveCreditOperation(
					planInput(f, svc, code, "c-analysis", "codebase_analysis"),
				), // 12
				svc.reserveCreditOperation({
					userId: f.userId,
					resourceType: "studio_project",
					studioProjectId: f.studioProject.id,
					studioJobId: f.studioJob.id,
					stage: "studio",
					operation: "studio.generate",
					metrics: {},
					idempotencyKey: "c-studio",
					quote: svc.estimateCreditQuote({
						operation: "studio.generate",
						metrics: {},
					}),
					isExempt: false,
				}), // 3
				svc.reserveCreditOperation({
					userId: f.userId,
					resourceType: "scrape",
					scrapeId: f.scrape.id,
					stage: "scrape",
					operation: "scrape.crawl",
					metrics: {},
					idempotencyKey: "c-scrape",
					quote: svc.estimateCreditQuote({
						operation: "scrape.crawl",
						metrics: {},
					}),
					isExempt: false,
				}), // 4
			]);
			const after = await balance(f.sub.id);
			const reservedByOps = await q(
				`SELECT COALESCE(SUM(reserved_credits),0)::int AS total FROM credit_operations WHERE user_id = $1 AND state = 'reserved'`,
				[f.userId],
			);
			expect(after.credits_reserved).toBeLessThanOrEqual(10);
			expect(after.credits_reserved).toBe(reservedByOps[0].total);
			expect(attempts.some((a) => a.status === "rejected")).toBe(true);
			const ledger = await q(
				`SELECT COALESCE(SUM(amount),0)::int AS total FROM credit_ledger_entries WHERE user_id = $1`,
				[f.userId],
			);
			expect(ledger[0].total).toBe(-after.credits_reserved);
		});

		it("collapses duplicate submissions into one reservation and rejects key reuse for another resource", async () => {
			const f = await fixture({ credits: 20 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const other = await f.mkProject("greenfield");
			const results = await Promise.all(
				Array.from({ length: 6 }, () =>
					svc.reserveCreditOperation(planInput(f, svc, green, "dup-key")),
				),
			);
			expect(new Set(results.map((r) => r.id)).size).toBe(1);
			expect((await balance(f.sub.id)).credits_reserved).toBe(8);
			await expect(
				svc.reserveCreditOperation(planInput(f, svc, other, "dup-key")),
			).rejects.toThrow("idempotency key identity mismatch");
			expect((await balance(f.sub.id)).credits_reserved).toBe(8);
		});
	});

	describe("settlement, release and refund invariants", () => {
		it("settles once, releases the unused part and rejects over-settlement and replays", async () => {
			const f = await fixture({ credits: 20 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const op = await svc.reserveCreditOperation(
				planInput(f, svc, green, "settle-1"),
			);
			await expect(
				svc.settleCreditOperation({
					userId: f.userId,
					operationId: op.id,
					artifactId: "a",
					finalCharge: 9,
					measuredUnits: 9,
				}),
			).rejects.toThrow("exceeds operation maximum");
			const settle = () =>
				svc.settleCreditOperation({
					userId: f.userId,
					operationId: op.id,
					artifactId: "a",
					finalCharge: 2,
					measuredUnits: 2,
				});
			const outcomes = await Promise.allSettled([settle(), settle()]);
			expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
			expect(await balance(f.sub.id)).toMatchObject({
				credits_used: 2,
				credits_reserved: 0,
			});
			const ledger = await q(
				`SELECT entry_type, amount FROM credit_ledger_entries WHERE operation_id = $1 ORDER BY entry_type`,
				[op.id],
			);
			expect(ledger.filter((l) => l.entry_type === "debit")).toEqual([
				{ entry_type: "debit", amount: -2 },
			]);
			await expect(
				svc.releaseCreditOperation({
					userId: f.userId,
					operationId: op.id,
					reason: "late",
				}),
			).rejects.toThrow("not active");
		});

		it("releases and refunds idempotently without deleting history", async () => {
			const f = await fixture({ credits: 20 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const released = await svc.reserveCreditOperation(
				planInput(f, svc, green, "rel-1"),
			);
			await svc.releaseCreditOperation({
				userId: f.userId,
				operationId: released.id,
				reason: "failed",
			});
			await expect(
				svc.releaseCreditOperation({
					userId: f.userId,
					operationId: released.id,
					reason: "again",
				}),
			).rejects.toThrow("not active");
			expect((await balance(f.sub.id)).credits_reserved).toBe(0);
			const settled = await svc.reserveCreditOperation(
				planInput(f, svc, green, "ref-1"),
			);
			await svc.settleCreditOperation({
				userId: f.userId,
				operationId: settled.id,
				artifactId: "a",
				finalCharge: 2,
				measuredUnits: 2,
			});
			await svc.refundCreditOperation({
				userId: f.userId,
				operationId: settled.id,
				reason: "r",
			});
			await expect(
				svc.refundCreditOperation({
					userId: f.userId,
					operationId: settled.id,
					reason: "r2",
				}),
			).rejects.toThrow("Only settled");
			expect((await balance(f.sub.id)).credits_used).toBe(0);
			expect(
				await q(`SELECT 1 FROM credit_operations WHERE id = $1`, [settled.id]),
			).toHaveLength(1);
		});
	});

	describe("period rollover while jobs run", () => {
		it("never releases or charges the next period's credits for a stale reservation", async () => {
			const f = await fixture({ credits: 2, plan: "free" });
			const svc = await services();
			const { rollOverFreeIfNeeded } = await import(
				"@/features/billing/services/credits"
			);
			await f.db
				.update(schema.subscriptions)
				.set({ credits: 20 })
				.where(eq(schema.subscriptions.id, f.sub.id));
			const green = await f.mkProject("greenfield");
			const stale = await svc.reserveCreditOperation(
				planInput(f, svc, green, "stale-1"),
			);
			expect((await balance(f.sub.id)).credits_reserved).toBe(8);

			const [row] = await f.db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.id, f.sub.id));
			// The reset is driven by the clock argument, not by editing rows.
			await rollOverFreeIfNeeded(row, new Date(Date.now() + 2 * 86_400_000));
			const reset = await balance(f.sub.id);
			expect(reset).toMatchObject({ credits_reserved: 0, allocation_epoch: 1 });

			// A reservation of the new period must survive the stale release.
			const fresh = await svc
				.reserveCreditOperation(
					planInput(f, svc, green, "fresh-1", "prd_generation"),
				)
				.catch(() => null);
			await svc.releaseCreditOperation({
				userId: f.userId,
				operationId: stale.id,
				reason: "stale cleanup",
			});
			const afterRelease = await balance(f.sub.id);
			expect(afterRelease.credits_reserved).toBeGreaterThanOrEqual(0);
			expect(afterRelease.credits_reserved).toBe(fresh ? 8 : 0);
			const [op] = await q(
				`SELECT state, reserved_credits FROM credit_operations WHERE id = $1`,
				[stale.id],
			);
			expect(op).toEqual({ state: "released", reserved_credits: 0 });
			const [entry] = await q(
				`SELECT metadata FROM credit_ledger_entries WHERE operation_id = $1 AND entry_type = 'release'`,
				[stale.id],
			);
			expect(entry.metadata.reconciliationCode).toBe("allocation_period_reset");
		});

		it("refuses to settle or refund across a reset instead of charging the new period", async () => {
			const f = await fixture({ credits: 20, plan: "free" });
			const svc = await services();
			const { rollOverFreeIfNeeded } = await import(
				"@/features/billing/services/credits"
			);
			const green = await f.mkProject("greenfield");
			const op = await svc.reserveCreditOperation(
				planInput(f, svc, green, "stale-settle"),
			);
			const [row] = await f.db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.id, f.sub.id));
			await rollOverFreeIfNeeded(row, new Date(Date.now() + 2 * 86_400_000));
			await expect(
				svc.settleCreditOperation({
					userId: f.userId,
					operationId: op.id,
					artifactId: "a",
					finalCharge: 2,
					measuredUnits: 2,
				}),
			).rejects.toThrow("invalid_period");
			expect(await balance(f.sub.id)).toMatchObject({
				credits_used: 0,
				credits_reserved: 0,
			});
			await svc.quarantineCreditOperation({
				userId: f.userId,
				operationId: op.id,
				reason: "period reset",
			});
			expect((await balance(f.sub.id)).credits_reserved).toBe(0);
		});
	});

	describe("expired reservations", () => {
		it("reconciles a stuck reservation exactly once", async () => {
			const f = await fixture({ credits: 20 });
			const svc = await services();
			const green = await f.mkProject("greenfield");
			const op = await svc.reserveCreditOperation({
				...planInput(f, svc, green, "expire-1"),
				expiresAt: new Date(Date.now() - 1000),
			});
			const [first, second] = await Promise.all([
				svc.reconcileExpiredCreditOperations({ userId: f.userId }),
				svc.reconcileExpiredCreditOperations({ userId: f.userId }),
			]);
			expect(
				[...first.releasedOperationIds, ...second.releasedOperationIds].filter(
					(id) => id === op.id,
				),
			).toHaveLength(1);
			expect((await balance(f.sub.id)).credits_reserved).toBe(0);
		});
	});

	describe("trial metadata compatibility", () => {
		it("represents a trial-funded operation without touching balances or activating trials", async () => {
			const f = await fixture();
			const green = await f.mkProject("greenfield");
			const insert = (reserved: number, id: string) =>
				q(
					`INSERT INTO credit_operations (id, user_id, resource_type, product, funding_source, project_id, kind, stage, idempotency_key, state, estimated_credits, reserved_credits, maximum_credits, pricing_version, metrics)
					 VALUES ($1, $2, 'plan_project', 'vibeplan_greenfield', 'trial', $3, 'prd_generation', 'prd', $1, 'quoted', 0, $4, 4, 'adaptive-v1', '{}')`,
					[id, f.userId, green, reserved],
				);
			await insert(0, "trial-ok");
			await expect(insert(2, "trial-bad")).rejects.toThrow(
				/credit_operations_funding_source_check/,
			);
			const svc = await services();
			const reserved = await svc.reserveCreditOperation(
				planInput(f, svc, green, "never-trial"),
			);
			const [row] = await q(
				`SELECT funding_source FROM credit_operations WHERE id = $1`,
				[reserved.id],
			);
			expect(row.funding_source).toBe("subscription_balance");
		});
	});
});
