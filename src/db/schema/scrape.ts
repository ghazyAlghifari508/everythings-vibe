import { sql } from "drizzle-orm";
import {
	check,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	DesignSettings,
	ScrapeRequest,
} from "@/features/scrape/types/scrape-contract";
import type {
	ScrapeImageDiscovery,
	ScrapeImageOutcome,
} from "@/features/scrape/utils/scrape-images";
import type {
	ScrapeErrorSource,
	ScrapeFailureReason,
} from "@/lib/design-errors";
import type { VisualEvidence } from "@/lib/design-visual-evidence";
import { users } from "./auth";

export type ScrapeMode = ScrapeRequest["mode"];

export interface ScrapeMetadata {
	designSettings?: DesignSettings;
	attempt?: number;
	capturedAt?: string;
	finalUrl?: string;
	viewport?: { width: number; height: number };
	captureMode?: string;
	screenshot?: string;
	visualEvidence?: VisualEvidence;
	htmlBytes?: number;
	previewHtmlBytes?: number;
	// Capture evidence observed during the run. `responseReceived` is true only
	// when an HTTP response was actually received, so the UI never displays an
	// HTTP status for a failure that never got one.
	responseReceived?: boolean;
	httpStatus?: number;
	resourceLoadTimedOut?: boolean;
	assetFetchFailures?: number;
	stage?: ScrapeStatus;
	progress?: number;
	stageStartedAt?: string;
	activity?: string;
	activityStartedAt?: string;
	timings?: Record<string, number>;
	errorMessage?: string;
	errorDetail?: string;
	// Which pipeline part failed and the evidence-backed reason behind it, so
	// the failure UI can separate website failures from internal ones.
	errorSource?: ScrapeErrorSource;
	failureReason?: ScrapeFailureReason;
	// Last real pipeline stage before the run failed. Lets the progress UI
	// mark the persisted failure stage instead of guessing where it stopped.
	failedAtStage?: ScrapeStatus;
	// Only set when the upstream website supplied a usable Retry-After signal.
	retryAfterSeconds?: number;
	// Persisted absolute deadline derived from Retry-After. Lets the UI show a
	// real remaining wait that stays accurate after refresh, and lets the
	// backend enforce the cooldown instead of relying on a disabled button.
	retryAfterExpiresAt?: string;
	// Tracks whether the optional AI reference summary was applied to a
	// canonical, evidence-backed DESIGN.md.
	aiEnrichment?: "applied" | "unavailable";
	aiEnrichmentDetail?: string;
	aiEnrichmentAttempts?: number;
	// Structured model version the current DESIGN.md was rendered from.
	// Lets the inspector distinguish verified current-model documents from
	// unverified legacy archives without parsing markdown footers.
	designModelVersion?: number;
	// Images mode: separates a page that truly has no images from a discovery
	// or capture failure, and records how the verified resources ended up.
	imageDiscovery?: ScrapeImageDiscovery;
	imageOutcome?: ScrapeImageOutcome;
	mode?: ScrapeMode;
	visitedPages?: number;
	discoveredPages?: number;
	processedImages?: number;
	discoveredImages?: number;
	savedImages?: number;
	imageStorage?: "postgres-private";
	completedPages?: number;
	skippedPages?: number;
	failedResources?: number;
	idempotencyKey?: string;
	workerHeartbeatAt?: string;
	workerHealth?: string;
}

export type ScrapeStatus =
	| "queued"
	| "capturing"
	| "extracting"
	| "generating"
	| "saving"
	| "completed"
	| "failed";

export function scrapeProgressForStatus(
	status: ScrapeStatus | string,
	mode: ScrapeMode = "design",
): number {
	if (mode === "html") {
		switch (status) {
			case "queued":
				return 15;
			case "capturing":
				return 40;
			case "extracting":
				return 75;
			case "saving":
				return 95;
			case "completed":
				return 100;
			case "failed":
				return 0;
			default:
				return 0;
		}
	}
	switch (status) {
		case "queued":
			return 10;
		case "capturing":
			return 30;
		case "extracting":
			return 55;
		case "generating":
			return 80;
		case "saving":
			return 95;
		case "completed":
			return 100;
		case "failed":
			return 0;
		default:
			return 0;
	}
}

export const SCRAPE_STATUS_LABELS: Record<string, string> = {
	queued: "Menunggu",
	capturing: "Mengambil halaman",
	extracting: "Menganalisis visual",
	generating: "Menyusun DESIGN.md",
	saving: "Menyimpan hasil",
	completed: "Selesai",
	failed: "Gagal",
};

export const HTML_SCRAPE_STATUS_LABELS: Record<string, string> = {
	queued: "Menunggu",
	capturing: "Mengambil halaman",
	extracting: "Menyiapkan preview",
	saving: "Menyimpan index.html",
	completed: "Selesai",
	failed: "Gagal",
};

export const scrapes = pgTable(
	"scrapes",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sourceUrl: text("source_url").notNull(),
		domain: text("domain").notNull(),
		title: text("title"),
		mode: text("mode", { enum: ["design", "html", "crawl", "images"] })
			.notNull()
			.default("design"),
		status: text("status", {
			enum: [
				"queued",
				"capturing",
				"extracting",
				"generating",
				"saving",
				"completed",
				"failed",
			],
		})
			.notNull()
			.default("queued"),
		html: text("html"),
		previewHtml: text("preview_html"),
		metadata: jsonb("metadata").$type<ScrapeMetadata>(),
		request: jsonb("request").$type<ScrapeRequest>(),
		jobToken: text("job_token"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		jobAttempts: integer("job_attempts").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("scrapes_user_id_idx").on(t.userId),
		index("scrapes_job_queue_idx").on(t.status, t.leaseExpiresAt, t.createdAt),
	],
);

export interface CrawlHeading {
	level: number;
	text: string;
}

export interface CrawlSection {
	title: string | null;
	level: number | null;
	text: string;
}

export interface CrawlPageContent {
	outgoingPages?: string[];
	description: string | null;
	headings: string[];
	text: string;
	links: string[];
	images: string[];
	patterns: string[];
	headingLevels?: CrawlHeading[];
	sections?: CrawlSection[];
	internalLinks?: string[];
	externalLinks?: string[];
}

export const scrapePages = pgTable(
	"scrape_pages",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		scrapeId: text("scrape_id")
			.notNull()
			.references(() => scrapes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		parentUrl: text("parent_url"),
		depth: integer("depth").notNull(),
		status: text("status", {
			enum: ["queued", "completed", "failed", "skipped"],
		})
			.notNull()
			.default("queued"),
		title: text("title"),
		httpStatus: integer("http_status"),
		content: jsonb("content").$type<CrawlPageContent>(),
		error: text("error"),
	},
	(t) => [
		uniqueIndex("scrape_pages_owner_url_idx").on(t.userId, t.scrapeId, t.url),
	],
);

export interface ImageEvidence {
	sources: string[];
	alt: string | null;
	classificationReason?: string;
	dimensionError?: string;
}

const privateImageBytes = customType<{ data: Buffer; driverData: Buffer }>({
	dataType: () => "bytea",
});

export const scrapeImageAssets = pgTable(
	"scrape_image_assets",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		scrapeId: text("scrape_id")
			.notNull()
			.references(() => scrapes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sha256: text("sha256").notNull(),
		mimeType: text("mime_type").notNull(),
		byteLength: integer("byte_length").notNull(),
		body: privateImageBytes("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("scrape_image_assets_owner_hash_idx").on(
			t.userId,
			t.scrapeId,
			t.sha256,
		),
		check(
			"scrape_image_assets_size_check",
			sql`${t.byteLength} > 0 AND ${t.byteLength} = octet_length(${t.body})`,
		),
	],
);

export const scrapeImages = pgTable(
	"scrape_images",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		scrapeId: text("scrape_id")
			.notNull()
			.references(() => scrapes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		pageUrl: text("page_url").notNull(),
		assetId: text("asset_id").references(() => scrapeImageAssets.id, {
			onDelete: "set null",
		}),
		failureCode: text("failure_code"),
		httpStatus: integer("http_status"),
		format: text("format"),
		width: integer("width"),
		height: integer("height"),
		classification: text("classification", {
			enum: ["logo", "icon", "illustration", "photograph", "screenshot"],
		}),
		evidence: jsonb("evidence").$type<ImageEvidence>().notNull(),
		status: text("status", { enum: ["queued", "completed", "failed"] })
			.notNull()
			.default("queued"),
		error: text("error"),
	},
	(t) => [
		uniqueIndex("scrape_images_owner_url_idx").on(t.userId, t.scrapeId, t.url),
	],
);

export const scrapeDocuments = pgTable(
	"scrape_documents",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		scrapeId: text("scrape_id")
			.notNull()
			.references(() => scrapes.id, { onDelete: "cascade" }),
		designMd: text("design_md").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("scrape_documents_scrape_id_idx").on(t.scrapeId)],
);

export type ScrapeRow = typeof scrapes.$inferSelect;
export type InsertScrapeRow = typeof scrapes.$inferInsert;
export type ScrapeDocumentRow = typeof scrapeDocuments.$inferSelect;
export type InsertScrapeDocumentRow = typeof scrapeDocuments.$inferInsert;
