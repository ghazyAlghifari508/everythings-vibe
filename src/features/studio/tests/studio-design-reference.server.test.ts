import { expect, it, vi } from "vitest";

const scrapeService = vi.hoisted(() => ({
	calls: [] as Array<{ scrapeId: string; userId: string }>,
	result: null as {
		scrapeId: string;
		sourceUrl: string;
		title: string | null;
		designMd: string;
	} | null,
	failure: null as Error | null,
}));

vi.mock("@/features/scrape/services/scrape-design-md-service", () => ({
	// Mirrors the real two-argument contract: a stale request envelope must fail
	// this test rather than be tolerated.
	getScrapeDesignMd: async (scrapeId: string, userId: string) => {
		scrapeService.calls.push({ scrapeId, userId });
		if (scrapeService.failure) throw scrapeService.failure;
		return scrapeService.result;
	},
}));

import { ScrapeError } from "@/lib/design-errors";
import {
	resolveStudioDesignReference,
	StudioReferenceError,
} from "../services/studio-design-reference.server";

async function referenceFailure(
	run: Promise<unknown>,
): Promise<StudioReferenceError> {
	const error = await run.catch((cause: unknown) => cause);
	expect(error).toBeInstanceOf(StudioReferenceError);
	if (error instanceof StudioReferenceError) return error;
	throw error;
}

it("resolves canonical themes and rejects unknown identity or meaningless uploads", async () => {
	const theme = await resolveStudioDesignReference(
		{ kind: "theme", id: "workspace" },
		"Untrusted replacement",
		"user-1",
	);
	expect(theme.designMd).toContain("Workspace");
	expect(theme.designReference).toEqual({
		kind: "theme",
		id: "workspace",
		source: "studio-presets",
		version: 1,
	});
	expect(
		(
			await referenceFailure(
				resolveStudioDesignReference(
					{ kind: "theme", id: "unknown" },
					null,
					"user-1",
				),
			)
		).failure,
	).toBe("unknown-theme");
	expect(
		(
			await referenceFailure(
				resolveStudioDesignReference(
					{ kind: "custom", filename: "style.md" },
					"This text contains no design tokens.",
					"user-1",
				),
			)
		).failure,
	).toBe("invalid-design-file");
	expect(
		(
			await referenceFailure(
				resolveStudioDesignReference(
					{ kind: "custom", filename: "style.md" },
					"# Sample\n| Canvas | #12345 | Background |",
					"user-1",
				),
			)
		).failure,
	).toBe("invalid-design-file");
	const custom = await resolveStudioDesignReference(
		{ kind: "custom", filename: "style.md" },
		"# Sample\nFont: Arial\n| Canvas | #ffffff | Background |",
		"user-1",
	);
	expect(custom.designReference?.kind).toBe("custom");
	expect(custom.designReference?.id).toMatch(/^[a-f0-9]{64}$/);
	expect(await resolveStudioDesignReference(null, "ignored", "user-1")).toEqual(
		{
			designMd: null,
			designReference: null,
		},
	);
});

it("resolves a stored scrape DESIGN.md for its owner only", async () => {
	scrapeService.result = {
		scrapeId: "scrape-1",
		sourceUrl: "https://example.com",
		title: "Example",
		designMd: "# Sample\nFont: Arial\n| Canvas | #ffffff | Background |",
	};
	const resolved = await resolveStudioDesignReference(
		{ kind: "scrape", id: "scrape-1" },
		null,
		"user-7",
	);
	expect(scrapeService.calls).toEqual([
		{ scrapeId: "scrape-1", userId: "user-7" },
	]);
	expect(resolved.designMd).toContain("# Sample");
	expect(resolved.designReference).toEqual({
		kind: "scrape",
		id: "scrape-1",
		source: "vibescrape",
		version: 1,
		sourceUrl: "https://example.com",
	});

	// An unavailable document is a recoverable reference failure, and the same
	// token gate as the upload path still applies.
	scrapeService.result = null;
	scrapeService.failure = new ScrapeError(
		"AI_GENERATION_FAILED",
		"DESIGN.md belum siap.",
	);
	const incomplete = await referenceFailure(
		resolveStudioDesignReference(
			{ kind: "scrape", id: "scrape-2" },
			null,
			"user-7",
		),
	);
	expect(incomplete.failure).toBe("source-unavailable");
	expect(incomplete.message).toBe(
		"Referensi desain ini sudah tidak tersedia. Pilih referensi lain.",
	);
	// Only the known unavailable codes are converted: anything else stays a real
	// failure instead of being dressed up as a reference the user can replace.
	scrapeService.failure = new Error("provider exploded");
	await expect(
		resolveStudioDesignReference(
			{ kind: "scrape", id: "scrape-4" },
			null,
			"user-7",
		),
	).rejects.toThrow("provider exploded");
	scrapeService.failure = null;
	scrapeService.result = {
		scrapeId: "scrape-3",
		sourceUrl: "https://example.com",
		title: null,
		designMd: "This text contains no design tokens.",
	};
	expect(
		(
			await referenceFailure(
				resolveStudioDesignReference(
					{ kind: "scrape", id: "scrape-3" },
					null,
					"user-7",
				),
			)
		).failure,
	).toBe("source-unavailable");
});
