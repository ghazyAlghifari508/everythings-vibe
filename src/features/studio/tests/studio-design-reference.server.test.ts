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

function readScrapeId(raw: unknown): string {
	if (typeof raw === "object" && raw !== null && "scrapeId" in raw) {
		const value: unknown = raw.scrapeId;
		if (typeof value === "string") return value;
	}
	return String(raw);
}

vi.mock("@/features/scrape/services/scrape-design-md-service", () => ({
	getScrapeDesignMd: async (raw: unknown, userId: string) => {
		scrapeService.calls.push({ scrapeId: readScrapeId(raw), userId });
		if (scrapeService.failure) throw scrapeService.failure;
		return scrapeService.result;
	},
}));

import { resolveStudioDesignReference } from "../services/studio-design-reference.server";

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
	await expect(
		resolveStudioDesignReference(
			{ kind: "theme", id: "unknown" },
			null,
			"user-1",
		),
	).rejects.toThrow();
	await expect(
		resolveStudioDesignReference(
			{ kind: "custom", filename: "style.md" },
			"This text contains no design tokens.",
			"user-1",
		),
	).rejects.toThrow();
	await expect(
		resolveStudioDesignReference(
			{ kind: "custom", filename: "style.md" },
			"# Sample\n| Canvas | #12345 | Background |",
			"user-1",
		),
	).rejects.toThrow();
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

	// An unavailable document fails closed instead of generating without a
	// design system, and the same token gate as the upload path still applies.
	scrapeService.result = null;
	scrapeService.failure = new Error("DESIGN.md belum siap.");
	await expect(
		resolveStudioDesignReference(
			{ kind: "scrape", id: "scrape-2" },
			null,
			"user-7",
		),
	).rejects.toThrow("DESIGN.md belum siap.");
	scrapeService.failure = null;
	scrapeService.result = {
		scrapeId: "scrape-3",
		sourceUrl: "https://example.com",
		title: null,
		designMd: "This text contains no design tokens.",
	};
	await expect(
		resolveStudioDesignReference(
			{ kind: "scrape", id: "scrape-3" },
			null,
			"user-7",
		),
	).rejects.toThrow();
});
