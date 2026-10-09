import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
// Server-module import is safe in vitest: .env.local provides DATABASE_URL
// (see vitest.config.ts) and no connection opens until a query runs.
import {
	buildCodebaseMetrics,
	estimateCreditQuote,
	formatInsufficientCreditsError,
	formatSubscriptionPausedError,
} from "./adaptive-credit";
import {
	type AnalysisResponse,
	AnalysisValidationError,
	analysisRequestSchema,
	analysisResponseSchema,
	buildAnalysisUserPrompt,
	CODEBASE_ANALYSIS_SYSTEM_PROMPT,
	type CodebaseAnalysis,
	type CodebaseStarterSuggestion,
	canContinueToCodebaseConclusion,
	codebaseAnalysisGenerationSchema,
	codebaseAnalysisSchema,
	codebaseStarterSuggestionsSchema,
	decideAnalysisRequest,
	inferTechAnswersFromCodebase,
	parseAnalysisOutput,
	parseCodebaseAnalysis,
	resolveAnalysisScope,
	selectSourceExcerpts,
	toSafeAnalysisErrorMessage,
} from "./codebase-analysis";
import { AnalysisServiceError } from "./codebase-analysis.server";
import type { SyncStatusResponse } from "./codebase-sync";
import {
	CODEBASE_STARTER_DESCRIPTION_MAX_CHARS,
	CODEBASE_STARTER_PROMPT_MAX_CHARS,
	CODEBASE_STARTER_TITLE_MAX_CHARS,
} from "./constants";
import {
	type CreditServiceStore,
	createCreditService,
} from "./services/credit-service";

const validAnalysis = {
	projectId: "proj_123",
	snapshotId: "snap_123",
	framework: "TanStack Start",
	language: "TypeScript",
	packageManager: "pnpm",
	dependencies: ["react", "drizzle-orm"],
	database: "PostgreSQL",
	auth: "Better Auth",
	moduleMap: [{ path: "src/routes", summary: "File-based routes" }],
	relevantFiles: ["src/db/schema.ts"],
	impactAreas: ["src/routes/api"],
	limitations: ["No test coverage for sync flow yet"],
	findings: [
		{
			title: "Auth boundary",
			detail: "Session is read from Better Auth headers.",
			uncertainty: "Token refresh path was not observed in the snapshot.",
		},
	],
} satisfies CodebaseAnalysis;

const validStarterSuggestions = [
	{
		id: "feature",
		title: "Feature task",
		description: "A focused task description.",
		prompt:
			"Implement a focused feature using patterns evidenced in the snapshot.",
		relevantPaths: ["src/feature.ts"],
	},
	{
		id: "bugfix",
		title: "Bugfix task",
		description: "A focused bugfix description.",
		prompt: "Fix a behavior supported by evidence in the snapshot.",
		relevantPaths: ["src/bugfix.ts"],
	},
	{
		id: "refactor",
		title: "Refactor task",
		description: "A focused refactor description.",
		prompt: "Refactor a proven module without changing its behavior.",
		relevantPaths: ["src/refactor.ts"],
	},
	{
		id: "ui",
		title: "UI task",
		description: "A focused UI description.",
		prompt:
			"Improve an existing interface using the snapshot's established patterns.",
		relevantPaths: ["src/ui.ts"],
	},
] as const;

describe("codebase analysis schema", () => {
	it("accepts a complete advisory analysis", () => {
		const result = codebaseAnalysisSchema.safeParse(validAnalysis);
		expect(result.success).toBe(true);
	});

	it("accepts exactly one suggestion for each starter category", () => {
		const result = codebaseStarterSuggestionsSchema.safeParse(
			validStarterSuggestions,
		);
		expect(result.success).toBe(true);
	});

	it("rejects a missing starter category", () => {
		expect(
			codebaseStarterSuggestionsSchema.safeParse(
				validStarterSuggestions.slice(1),
			).success,
		).toBe(false);
	});

	it("rejects a duplicated starter category even when four items are present", () => {
		const duplicated = [
			...validStarterSuggestions.slice(0, 3),
			{ ...validStarterSuggestions[3], id: validStarterSuggestions[0].id },
		];
		expect(codebaseStarterSuggestionsSchema.safeParse(duplicated).success).toBe(
			false,
		);
	});

	it("rejects malformed starter suggestion fields and category ids", () => {
		const emptyTitle = validStarterSuggestions.map((suggestion, index) =>
			index === 0 ? { ...suggestion, title: "" } : suggestion,
		);
		const invalidId = validStarterSuggestions.map((suggestion, index) =>
			index === 0 ? { ...suggestion, id: "other" } : suggestion,
		);
		expect(codebaseStarterSuggestionsSchema.safeParse(emptyTitle).success).toBe(
			false,
		);
		expect(codebaseStarterSuggestionsSchema.safeParse(invalidId).success).toBe(
			false,
		);
	});

	it("keeps starter suggestions optional for legacy analysis rows", () => {
		expect(codebaseAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
	});

	it("requires the complete starter set for newly generated analysis", () => {
		expect(
			codebaseAnalysisGenerationSchema.safeParse({
				...validAnalysis,
				starterSuggestions: validStarterSuggestions,
			}).success,
		).toBe(true);
		expect(
			codebaseAnalysisGenerationSchema.safeParse(validAnalysis).success,
		).toBe(false);
	});

	it("rejects analysis missing project identity", () => {
		const { projectId: _omitted, ...withoutProject } = validAnalysis;
		expect(codebaseAnalysisSchema.safeParse(withoutProject).success).toBe(
			false,
		);
	});

	it("rejects analysis missing snapshot identity", () => {
		const { snapshotId: _omitted, ...withoutSnapshot } = validAnalysis;
		expect(codebaseAnalysisSchema.safeParse(withoutSnapshot).success).toBe(
			false,
		);
	});

	it("accepts an uncertain finding with an explicit uncertainty field", () => {
		const result = codebaseAnalysisSchema.safeParse({
			...validAnalysis,
			findings: [
				{
					title: "Uncertain dependency",
					detail: "A background worker may exist outside the snapshot.",
					uncertainty: "Not visible in the uploaded manifest.",
				},
			],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.findings?.[0]?.uncertainty).toContain("Not visible");
		}
	});

	it("rejects findings with an empty claim", () => {
		const result = codebaseAnalysisSchema.safeParse({
			...validAnalysis,
			findings: [{ title: "", detail: "Missing title." }],
		});
		expect(result.success).toBe(false);
	});

	it("accepts a model-generated application summary", () => {
		const result = codebaseAnalysisSchema.safeParse({
			...validAnalysis,
			summary: "Aplikasi kasir web untuk UMKM dengan alur penjualan dan stok.",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.summary).toContain("kasir");
		}
	});

	it("accepts legacy output without an application summary", () => {
		const { summary: _omitted, ...legacy } = {
			...validAnalysis,
			summary: "Aplikasi kasir web untuk UMKM.",
		};
		expect(codebaseAnalysisSchema.safeParse(legacy).success).toBe(true);
	});

	it("rejects an application summary beyond the documented bound", () => {
		const result = codebaseAnalysisSchema.safeParse({
			...validAnalysis,
			summary: "x".repeat(1001),
		});
		expect(result.success).toBe(false);
	});
});

describe("parseCodebaseAnalysis", () => {
	it("returns validated analysis for valid input", () => {
		expect(parseCodebaseAnalysis(validAnalysis).snapshotId).toBe("snap_123");
	});

	it("throws on invalid input", () => {
		expect(() => parseCodebaseAnalysis({ projectId: "only" })).toThrow();
	});
});

describe("codebase analysis system prompt", () => {
	it("requires JSON-only output and forbids inventing paths", () => {
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/JSON/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(
			/ketidakpastian|uncertainty/i,
		);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(
			/jangan.*(mengarang|invent)/i,
		);
	});

	it("requests an application summary describing what the app does", () => {
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/summary/i);
	});

	it("declares the repository name identity metadata, never a feature request", () => {
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/metadata/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/bukan permintaan fitur/i);
	});

	it("requires all starter categories and repository evidence without stack-based domain guesses", () => {
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toContain("starterSuggestions");
		for (const category of ["feature", "bugfix", "refactor", "ui"]) {
			expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toContain(`"id": "${category}"`);
		}
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/snapshot|manifest/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/tidak menggandakan/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/migrasi stack/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).toMatch(/Bahasa Indonesia/i);
		expect(CODEBASE_ANALYSIS_SYSTEM_PROMPT).not.toContain(
			"jalur dari manifest bila relevan",
		);
	});
});

describe("buildAnalysisUserPrompt", () => {
	const baseInput = {
		projectId: "proj_123",
		snapshotId: "snap_123",
		featurePrompt: "Aplikasi kasir untuk UMKM",
		manifest: [
			{ path: "src/index.ts", size: 120, hash: "a".repeat(64) },
			{ path: "src/db/schema.ts", size: 340, hash: "b".repeat(64) },
		],
		files: [{ path: "src/index.ts", text: "export const x = 1;" }],
		fileCount: 2,
		excludedCount: 5,
	};

	it("includes the feature prompt, manifest paths, and counts", () => {
		const prompt = buildAnalysisUserPrompt(baseInput);
		expect(prompt).toContain("Aplikasi kasir untuk UMKM");
		expect(prompt).toContain("src/index.ts");
		expect(prompt).toContain("src/db/schema.ts");
		expect(prompt).toContain("snap_123");
	});

	it("bounds source excerpts and marks truncation explicitly", () => {
		const big = "x".repeat(5000);
		const prompt = buildAnalysisUserPrompt({
			...baseInput,
			files: [{ path: "src/big.ts", text: big }],
			maxContextChars: 100,
		});
		expect(prompt.length).toBeLessThan(5000);
		expect(prompt).toMatch(/dipotong|truncat/i);
	});

	it("labels repository metadata separately from user feature intent", () => {
		const prompt = buildAnalysisUserPrompt({
			...baseInput,
			repositoryName: "react-movie-app",
		});
		expect(prompt).toContain("react-movie-app");
		expect(prompt).toMatch(/metadata/i);
		expect(prompt).toContain("Permintaan fitur user:");
	});

	it("omits the repository line when no repository name is known", () => {
		const prompt = buildAnalysisUserPrompt(baseInput);
		expect(prompt).not.toMatch(/Repository:/);
		expect(prompt).toContain("Permintaan fitur user:");
	});
});

describe("selectSourceExcerpts", () => {
	it("preserves file order and caps total characters", () => {
		const { excerpts, truncated } = selectSourceExcerpts(
			[
				{ path: "a.ts", text: "aaa" },
				{ path: "b.ts", text: "bbb" },
			],
			5,
		);
		expect(excerpts[0]?.path).toBe("a.ts");
		expect(truncated).toBe(true);
		const total = excerpts.reduce((sum, f) => sum + f.text.length, 0);
		expect(total).toBeLessThanOrEqual(5);
	});

	it("returns everything untruncated when under the cap", () => {
		const { excerpts, truncated } = selectSourceExcerpts(
			[{ path: "a.ts", text: "aaa" }],
			1000,
		);
		expect(truncated).toBe(false);
		expect(excerpts).toHaveLength(1);
	});
});

describe("parseAnalysisOutput", () => {
	const ids = { projectId: "proj_123", snapshotId: "snap_123" };
	const trustedManifestPaths = new Set([
		"src/feature.ts",
		"src/bugfix.ts",
		"src/refactor.ts",
		"src/ui.ts",
	]);
	const modelJson = JSON.stringify({
		framework: "TanStack Start",
		language: "TypeScript",
		starterSuggestions: validStarterSuggestions,
	});

	it("validates bare model JSON and injects server identities", () => {
		const result = parseAnalysisOutput(modelJson, ids, trustedManifestPaths);
		expect(result.projectId).toBe("proj_123");
		expect(result.snapshotId).toBe("snap_123");
		expect(result.framework).toBe("TanStack Start");
	});

	it("validates fenced model JSON", () => {
		const result = parseAnalysisOutput(
			`\`\`json\n${modelJson}\n\`\`\``,
			ids,
			trustedManifestPaths,
		);
		expect(result.language).toBe("TypeScript");
	});

	it("overrides model-provided identities with server values", () => {
		const result = parseAnalysisOutput(
			JSON.stringify({
				projectId: "proj_evil",
				snapshotId: "snap_evil",
				framework: "X",
				starterSuggestions: validStarterSuggestions,
			}),
			ids,
			trustedManifestPaths,
		);
		expect(result.projectId).toBe("proj_123");
		expect(result.snapshotId).toBe("snap_123");
	});

	it("throws a typed error without leaking model text on invalid JSON", () => {
		const raw = "{ not json at all {{{";
		try {
			parseAnalysisOutput(raw, ids, trustedManifestPaths);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(AnalysisValidationError);
			expect((error as AnalysisValidationError).code).toBe("ANALYSIS_FAILED");
			expect((error as Error).message).not.toContain("not json");
		}
	});

	it("throws a typed error when the shape fails validation", () => {
		try {
			parseAnalysisOutput(
				JSON.stringify({ framework: 42 }),
				ids,
				trustedManifestPaths,
			);
			expect.unreachable("expected AnalysisValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(AnalysisValidationError);
			expect((error as AnalysisValidationError).code).toBe("ANALYSIS_FAILED");
		}
	});

	it("rejects a suggestion path that is not present in the trusted snapshot manifest", () => {
		const suggestionsWithUntrustedPath = validStarterSuggestions.map(
			(suggestion, index) =>
				index === 0
					? { ...suggestion, relevantPaths: ["src/not-in-manifest.ts"] }
					: suggestion,
		);
		expect(() =>
			parseAnalysisOutput(
				JSON.stringify({ starterSuggestions: suggestionsWithUntrustedPath }),
				ids,
				trustedManifestPaths,
			),
		).toThrow(AnalysisValidationError);
	});
});

describe("decideAnalysisRequest", () => {
	it("rejects analysis when the snapshot is not uploaded", () => {
		for (const status of ["uploading", "failed", "expired", "analyzing"]) {
			const decision = decideAnalysisRequest({ id: "snap_1", status }, []);
			expect(decision.action).toBe("reject");
		}
	});

	it("reuses a pending analysis instead of duplicating it", () => {
		const decision = decideAnalysisRequest(
			{ id: "snap_1", status: "uploaded" },
			[{ id: "an_pending", status: "pending" }],
		);
		expect(decision).toEqual({ action: "reuse", analysisId: "an_pending" });
	});

	it("reuses a ready analysis instead of regenerating", () => {
		const decision = decideAnalysisRequest(
			{ id: "snap_1", status: "uploaded" },
			[{ id: "an_ready", status: "ready" }],
		);
		expect(decision).toEqual({ action: "reuse", analysisId: "an_ready" });
	});

	it("creates a fresh record when there is no analysis yet", () => {
		const decision = decideAnalysisRequest(
			{ id: "snap_1", status: "uploaded" },
			[],
		);
		expect(decision).toEqual({ action: "create" });
	});

	it("creates a fresh record after a failed attempt", () => {
		const decision = decideAnalysisRequest(
			{ id: "snap_1", status: "uploaded" },
			[{ id: "an_failed", status: "failed" }],
		);
		expect(decision).toEqual({ action: "create" });
	});
});

describe("analysis trigger/read DTOs", () => {
	it("accepts an empty trigger body (latest uploaded snapshot)", () => {
		expect(analysisRequestSchema.safeParse({}).success).toBe(true);
	});

	it("accepts a pinned snapshot trigger", () => {
		expect(
			analysisRequestSchema.safeParse({ snapshotId: "snap_123" }).success,
		).toBe(true);
	});

	it("rejects an empty pinned snapshot id", () => {
		expect(analysisRequestSchema.safeParse({ snapshotId: "" }).success).toBe(
			false,
		);
	});

	it("accepts a ready analysis response with validated output", () => {
		const result = analysisResponseSchema.safeParse({
			id: "an_123",
			projectId: "proj_123",
			snapshotId: "snap_123",
			status: "pending",
		});
		expect(result.success).toBe(true);
	});

	it("rejects an analysis response with an unknown status", () => {
		expect(
			analysisResponseSchema.safeParse({
				id: "an_123",
				projectId: "proj_123",
				snapshotId: "snap_123",
				status: "analyzing",
			}).success,
		).toBe(false);
	});

	it("enforces the configured starter text bounds", () => {
		const tooLongTitle = validStarterSuggestions.map((suggestion, index) =>
			index === 0
				? {
						...suggestion,
						title: "x".repeat(CODEBASE_STARTER_TITLE_MAX_CHARS + 1),
					}
				: suggestion,
		);
		const tooLongDescription = validStarterSuggestions.map(
			(suggestion, index) =>
				index === 0
					? {
							...suggestion,
							description: "x".repeat(
								CODEBASE_STARTER_DESCRIPTION_MAX_CHARS + 1,
							),
						}
					: suggestion,
		);
		const tooLongPrompt = validStarterSuggestions.map((suggestion, index) =>
			index === 0
				? {
						...suggestion,
						prompt: "x".repeat(CODEBASE_STARTER_PROMPT_MAX_CHARS + 1),
					}
				: suggestion,
		);

		for (const suggestions of [
			tooLongTitle,
			tooLongDescription,
			tooLongPrompt,
		]) {
			expect(
				codebaseStarterSuggestionsSchema.safeParse(suggestions).success,
			).toBe(false);
		}
	});
});

describe("analysis ownership scope", () => {
	it("binds a feature project to its codebase-owned sync session", () => {
		expect(
			resolveAnalysisScope({
				projectId: "feature-1",
				projectMode: "existing_codebase",
				projectCodebaseId: "codebase-1",
				projectUserId: "user-1",
				authenticatedUserId: "user-1",
				codebaseOwnerId: "user-1",
			}),
		).toEqual({
			kind: "codebase",
			projectId: "feature-1",
			codebaseId: "codebase-1",
		});
	});

	it("returns not found when the feature project is owned by another user", () => {
		expect(
			resolveAnalysisScope({
				projectId: "feature-1",
				projectMode: "existing_codebase",
				projectCodebaseId: "codebase-1",
				projectUserId: "user-2",
				authenticatedUserId: "user-1",
				codebaseOwnerId: "user-2",
			}),
		).toEqual({ kind: "not_found" });
	});

	it("returns not found when the bound codebase is owned by another user", () => {
		expect(
			resolveAnalysisScope({
				projectId: "feature-1",
				projectMode: "existing_codebase",
				projectCodebaseId: "codebase-1",
				projectUserId: "user-1",
				authenticatedUserId: "user-1",
				codebaseOwnerId: "user-2",
			}),
		).toEqual({ kind: "not_found" });
	});

	it("keeps legacy project-scoped existing-codebase sessions project-bound", () => {
		expect(
			resolveAnalysisScope({
				projectId: "project-1",
				projectMode: "existing_codebase",
				projectCodebaseId: null,
				projectUserId: "user-1",
				authenticatedUserId: "user-1",
			}),
		).toEqual({ kind: "project", projectId: "project-1" });
	});
});

describe("toSafeAnalysisErrorMessage", () => {
	it("returns a fixed user-facing message without error internals", () => {
		const message = toSafeAnalysisErrorMessage(
			new Error("sk-abcdef secret stack trace"),
		);
		expect(message).toMatch(/gagal|coba lagi/i);
		expect(message).not.toContain("sk-abcdef");
	});

	it("handles non-error values safely", () => {
		expect(toSafeAnalysisErrorMessage(null)).toMatch(/gagal|tidak tersedia/i);
		expect(toSafeAnalysisErrorMessage("raw string")).not.toContain(
			"raw string",
		);
	});
});

describe("inferTechAnswersFromCodebase", () => {
	it("infers React + Vite frontend and Vercel deployment correctly", () => {
		const inferred = inferTechAnswersFromCodebase(
			{
				projectId: "p1",
				snapshotId: "s1",
				framework: "React 19 (Vite, Tailwind CSS, React Router)",
				language: "JavaScript",
				dependencies: [
					"react",
					"react-dom",
					"react-router-dom",
					"axios",
					"tailwind-merge",
				],
				relevantFiles: ["vercel.json", "src/App.jsx"],
			},
			"web",
		);

		expect(inferred.frontend).toBe("React (Vite)");
		expect(inferred.deployment).toBe("Vercel");
	});

	it("infers TanStack Start fullstack framework and PostgreSQL database", () => {
		const inferred = inferTechAnswersFromCodebase(
			{
				projectId: "p1",
				snapshotId: "s1",
				framework: "TanStack Start",
				language: "TypeScript",
				dependencies: ["@tanstack/react-start", "drizzle-orm", "pg"],
				database: "PostgreSQL · Drizzle ORM",
			},
			"web",
		);

		expect(inferred.fullstackFramework).toBe("TanStack Start (FE+BE)");
		expect(inferred.database).toBe("PostgreSQL");
		expect(inferred.deployment).toBe("Vercel");
	});

	it("infers mobile frameworks when platform is mobile", () => {
		const inferred = inferTechAnswersFromCodebase(
			{
				projectId: "p1",
				snapshotId: "s1",
				framework: "Expo React Native",
				dependencies: ["expo", "react-native"],
			},
			"mobile",
		);

		expect(inferred.frontend).toBe("Expo");
	});
});

describe("codebase analysis credit lifecycle", () => {
	function makeStore(): CreditServiceStore {
		return {
			subscriptions: new Map([
				[
					"sub-1",
					{
						id: "sub-1",
						userId: "user-1",
						credits: 20,
						creditsUsed: 0,
						creditsReserved: 0,
						currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
					},
				],
			]),
			projects: new Map([["project-1", { id: "project-1", userId: "user-1" }]]),
			operations: new Map(),
			ledger: [],
		};
	}

	it("calculates codebase complexity metrics from snapshot fileCount and contentSize", () => {
		const metrics = buildCodebaseMetrics({
			fileCount: 120,
			contentSize: 450_000,
		});

		expect(metrics).toEqual({
			codebase: {
				fileCount: 120,
				sourceBytes: 450_000,
			},
		});
	});

	it("ready analysis reuse causes zero credit reservations or debits", () => {
		const store = makeStore();
		const decision = decideAnalysisRequest(
			{ id: "snap_1", status: "uploaded" },
			[{ id: "an_ready", status: "ready" }],
		);
		expect(decision).toEqual({ action: "reuse", analysisId: "an_ready" });

		const subscription = store.subscriptions.get("sub-1");
		expect(store.operations.size).toBe(0);
		expect(store.ledger).toHaveLength(0);
		expect(subscription?.creditsReserved).toBe(0);
		expect(subscription?.creditsUsed).toBe(0);
	});

	it("new analysis reserves before execution and settles on success with artifact ID", () => {
		const store = makeStore();
		const service = createCreditService(store);
		const metrics = buildCodebaseMetrics({
			fileCount: 100,
			contentSize: 250_000,
		});
		const quote = service.createCreditQuote({
			userId: "user-1",
			projectId: "project-1",
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		expect(quote.operation).toBe("codebase_analysis");
		expect(quote.maximumCredits).toBe(12);

		const reservation = service.reserveCreditOperation({
			userId: "user-1",
			projectId: "project-1",
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: "project-1:codebase_analysis:snap-1",
			quote,
		});

		expect(reservation.state).toBe("reserved");
		const subscription = store.subscriptions.get("sub-1");
		expect(subscription?.creditsReserved).toBe(12);

		service.markCreditOperationRunning({
			userId: "user-1",
			operationId: reservation.id,
		});

		const settled = service.settleCreditOperation({
			userId: "user-1",
			operationId: reservation.id,
			artifactId: "analysis-row-uuid-1",
			actualMetrics: metrics,
		});

		expect(settled.state).toBe("settled");
		expect(settled.finalCharge).toBe(quote.estimatedCredits);
		expect(subscription?.creditsReserved).toBe(0);
		expect(subscription?.creditsUsed).toBe(quote.estimatedCredits);

		const op = store.operations.get(reservation.id);
		expect(op?.artifactReference).toBe("analysis-row-uuid-1");
	});

	it("analysis failure releases reservation with 0 debit", () => {
		const store = makeStore();
		const service = createCreditService(store);
		const metrics = buildCodebaseMetrics({
			fileCount: 50,
			contentSize: 100_000,
		});
		const quote = service.createCreditQuote({
			userId: "user-1",
			projectId: "project-1",
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
		});

		const reservation = service.reserveCreditOperation({
			userId: "user-1",
			projectId: "project-1",
			stage: "codebase",
			operation: "codebase_analysis",
			metrics,
			idempotencyKey: "project-1:codebase_analysis:snap-fail",
			quote,
		});

		service.markCreditOperationRunning({
			userId: "user-1",
			operationId: reservation.id,
		});

		const released = service.releaseCreditOperation({
			userId: "user-1",
			operationId: reservation.id,
			reason: "AI model failed",
		});

		expect(released.state).toBe("released");
		expect(released.finalCharge).toBeNull();
		const subscription = store.subscriptions.get("sub-1");
		expect(subscription?.creditsReserved).toBe(0);
		expect(subscription?.creditsUsed).toBe(0);
		expect(store.ledger.reduce((sum, e) => sum + e.amount, 0)).toBe(0);
	});

	it("insufficient credits rejects with 403 before model execution", () => {
		const store = makeStore();
		const subscription = store.subscriptions.get("sub-1");
		if (!subscription) throw new Error("Missing test fixture");
		subscription.credits = 3;

		const metrics = buildCodebaseMetrics({
			fileCount: 10,
			contentSize: 20_000,
		});
		const quote = estimateCreditQuote({
			operation: "codebase_analysis",
			metrics,
		});

		const availableCredits = Math.max(
			0,
			subscription.credits -
				subscription.creditsUsed -
				subscription.creditsReserved,
		);

		expect(availableCredits < quote.maximumCredits).toBe(true);

		const err = formatInsufficientCreditsError({
			quote,
			availableCredits,
			stageLabel: "analisis codebase",
		});

		expect(err.code).toBe("NO_CREDITS");
		expect(err.requiredCredits).toBe(12);
		expect(err.availableCredits).toBe(3);
	});

	it("paused subscription rejects with 403 before model execution", () => {
		const metrics = buildCodebaseMetrics({
			fileCount: 10,
			contentSize: 20_000,
		});
		const quote = estimateCreditQuote({
			operation: "codebase_analysis",
			metrics,
		});

		const err = formatSubscriptionPausedError({
			quote,
			availableCredits: 10,
			stageLabel: "analisis codebase",
		});

		expect(err.code).toBe("SUBSCRIPTION_PAUSED");
		expect(err.requiredCredits).toBe(12);
		expect(err.availableCredits).toBe(10);
	});

	it("constructs AnalysisServiceError with code, message, and optional analysisId", () => {
		const err = new AnalysisServiceError(
			"ANALYSIS_FAILED",
			"Model timeout",
			"an_123",
		);
		expect(err.code).toBe("ANALYSIS_FAILED");
		expect(err.message).toBe("Model timeout");
		expect(err.analysisId).toBe("an_123");
	});
});

describe("requestCodebaseAnalysis atomic claim contract", () => {
	it("claims session atomically using conditional uploaded status in a transaction", async () => {
		const raw = await readFile(
			new URL("./codebase-analysis.server.ts", import.meta.url),
			"utf8",
		);
		const source = raw.replace(/\r\n/g, "\n");
		const requestStartIndex = source.indexOf(
			"export async function requestCodebaseAnalysis(",
		);
		const requestSource = source.slice(requestStartIndex);
		const claimIndex = requestSource.indexOf("db.transaction(async (tx) => {");
		const legacyClaimIndex = requestSource.indexOf(
			"const [updated] = await tx",
		);
		const conditionalUpdateIndex = requestSource.indexOf(
			'eq(codebaseSyncSessions.status, "uploaded")',
			legacyClaimIndex,
		);
		const insertAnalysisIndex = requestSource.indexOf(
			"tx.insert(codebaseAnalyses)",
			legacyClaimIndex,
		);
		const generateIndex = requestSource.indexOf("await generate(messages)");

		expect(requestStartIndex).toBeGreaterThan(-1);
		expect(claimIndex).toBeGreaterThan(-1);
		expect(legacyClaimIndex).toBeGreaterThan(claimIndex);
		expect(conditionalUpdateIndex).toBeGreaterThan(legacyClaimIndex);
		expect(insertAnalysisIndex).toBeGreaterThan(conditionalUpdateIndex);
		expect(generateIndex).toBeGreaterThan(insertAnalysisIndex);
	});

	it("keeps shared codebase sessions uploaded while feature analysis completes", async () => {
		const raw = await readFile(
			new URL("./codebase-analysis.server.ts", import.meta.url),
			"utf8",
		);
		const source = raw.replace(/\r\n/g, "\n");
		const requestStartIndex = source.indexOf(
			"export async function requestCodebaseAnalysis(",
		);
		const requestSource = source.slice(requestStartIndex);
		const scopedClaimIndex = requestSource.indexOf("if (scope.codebaseId) {");
		const scopedReadyIndex = requestSource.indexOf(
			"if (!isCodebaseScoped) {\n\t\t\t\t// The snapshot stays `uploaded`",
		);

		expect(requestStartIndex).toBeGreaterThan(-1);
		expect(scopedClaimIndex).toBeGreaterThan(-1);
		expect(scopedReadyIndex).toBeGreaterThan(scopedClaimIndex);
		expect(requestSource.slice(scopedClaimIndex, scopedReadyIndex)).toContain(
			"tx.insert(codebaseAnalyses)",
		);
	});
});

describe("decideAnalysisRequest with an already-analyzed uploaded snapshot", () => {
	it("reuses a ready analysis on an uploaded snapshot", () => {
		expect(
			decideAnalysisRequest({ id: "s1", status: "uploaded" }, [
				{ id: "a1", status: "ready" },
			]),
		).toEqual({ action: "reuse", analysisId: "a1" });
	});

	it("creates a new record when only failed attempts exist", () => {
		expect(
			decideAnalysisRequest({ id: "s1", status: "uploaded" }, [
				{ id: "a1", status: "failed" },
			]),
		).toEqual({ action: "create" });
	});

	it("rejects a snapshot that is not uploaded", () => {
		const decision = decideAnalysisRequest(
			{ id: "s1", status: "uploading" },
			[],
		);
		expect(decision.action).toBe("reject");
	});
});

describe("canContinueToCodebaseConclusion", () => {
	const validSuggestions: CodebaseStarterSuggestion[] =
		validStarterSuggestions.map((suggestion) => ({
			id: suggestion.id,
			title: suggestion.title,
			description: suggestion.description,
			prompt: suggestion.prompt,
			relevantPaths: [...suggestion.relevantPaths],
		}));

	const validAnalysisOutput: CodebaseAnalysis = {
		...validAnalysis,
		projectId: "proj_123",
		snapshotId: "snap_123",
		starterSuggestions: [...validSuggestions],
	};

	const validReadyAnalysis: AnalysisResponse = {
		id: "an_123",
		projectId: "proj_123",
		snapshotId: "snap_123",
		status: "ready",
		output: validAnalysisOutput,
	};

	const validReadySyncStatus: SyncStatusResponse = {
		projectId: "cb_123",
		sessionId: "sess_123",
		status: "uploaded",
		snapshotId: "snap_123",
		cliConnectedAt: "2026-10-09T10:00:00.000Z",
		analysisId: "an_123",
		analysisStatus: "ready",
	};

	const defaultInput = {
		status: validReadySyncStatus,
		analysis: validReadyAnalysis,
		codebaseId: "cb_123",
		analysisProjectId: "proj_123",
	};

	it("returns false when analysis is still pending on an uploaded snapshot", () => {
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					analysisStatus: "pending",
				},
				analysis: {
					...validReadyAnalysis,
					status: "pending",
				},
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					analysisStatus: "pending",
				},
			}),
		).toBe(false);
	});

	it("returns true when analysis is ready for current project, snapshot, and id with exactly 4 valid suggestions", () => {
		expect(canContinueToCodebaseConclusion(defaultInput)).toBe(true);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					status: "ready",
				},
			}),
		).toBe(true);
	});

	it("returns false when analysis status is ready but belongs to an old snapshot", () => {
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					snapshotId: "snap_new",
				},
				analysis: {
					...validReadyAnalysis,
					snapshotId: "snap_old",
				},
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: {
						...validAnalysisOutput,
						snapshotId: "snap_old",
					},
				},
			}),
		).toBe(false);
	});

	it("returns false for wrong project or id", () => {
		// Wrong codebaseId
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				codebaseId: "cb_other",
			}),
		).toBe(false);

		// Wrong analysisProjectId
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysisProjectId: "proj_other",
			}),
		).toBe(false);

		// Absent analysisProjectId
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysisProjectId: null,
			}),
		).toBe(false);

		// Analysis response belongs to different project
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					projectId: "proj_other",
				},
			}),
		).toBe(false);

		// Analysis output belongs to different project
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: {
						...validAnalysisOutput,
						projectId: "proj_other",
					},
				},
			}),
		).toBe(false);

		// Analysis id mismatch between status and analysis
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					analysisId: "an_different",
				},
			}),
		).toBe(false);

		// Absent analysisId on status
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					analysisId: undefined,
				},
			}),
		).toBe(false);
	});

	it("returns false when analysis output is absent", () => {
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: null,
				},
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: undefined,
				},
			}),
		).toBe(false);
	});

	it("returns false when suggestions are absent or invalid (keeps legacy output parse-compatible but not ready)", () => {
		// Legacy output: valid against codebaseAnalysisSchema, but has no starterSuggestions
		const legacyOutput: CodebaseAnalysis = {
			...validAnalysis,
			projectId: "proj_123",
			snapshotId: "snap_123",
		};
		expect(codebaseAnalysisSchema.safeParse(legacyOutput).success).toBe(true);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: legacyOutput,
				},
			}),
		).toBe(false);

		// Invalid suggestions: empty array
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: {
						...validAnalysisOutput,
						starterSuggestions: [],
					},
				},
			}),
		).toBe(false);

		// Invalid suggestions: missing a required category (only 3)
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: {
						...validAnalysisOutput,
						starterSuggestions: validSuggestions.slice(1),
					},
				},
			}),
		).toBe(false);

		// Invalid suggestions: duplicate category
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: {
					...validReadyAnalysis,
					output: {
						...validAnalysisOutput,
						starterSuggestions: [
							...validSuggestions.slice(0, 3),
							{
								...validSuggestions[3],
								id: validSuggestions[0].id,
							},
						],
					},
				},
			}),
		).toBe(false);
	});

	it("returns false when sync transport or handshake is incomplete", () => {
		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: null,
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				analysis: null,
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					snapshotId: null,
				},
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					status: "uploading",
				},
			}),
		).toBe(false);

		expect(
			canContinueToCodebaseConclusion({
				...defaultInput,
				status: {
					...validReadySyncStatus,
					status: "waiting_for_cli",
				},
			}),
		).toBe(false);
	});
});
