import { expect, it } from "vitest";
import { resolveStudioDesignReference } from "./studio-design-reference.server";

it("resolves canonical themes and rejects unknown identity or meaningless uploads", () => {
	const theme = resolveStudioDesignReference(
		{ kind: "theme", id: "workspace" },
		"Untrusted replacement",
	);
	expect(theme.designMd).toContain("Workspace");
	expect(theme.designReference).toEqual({
		kind: "theme",
		id: "workspace",
		source: "studio-presets",
		version: 1,
	});
	expect(() =>
		resolveStudioDesignReference({ kind: "theme", id: "unknown" }, null),
	).toThrow();
	expect(() =>
		resolveStudioDesignReference(
			{ kind: "custom", filename: "style.md" },
			"This text contains no design tokens.",
		),
	).toThrow();
	expect(() =>
		resolveStudioDesignReference(
			{ kind: "custom", filename: "style.md" },
			"# Sample\n| Canvas | #12345 | Background |",
		),
	).toThrow();
	const custom = resolveStudioDesignReference(
		{ kind: "custom", filename: "style.md" },
		"# Sample\nFont: Arial\n| Canvas | #ffffff | Background |",
	);
	expect(custom.designReference?.kind).toBe("custom");
	expect(custom.designReference?.id).toMatch(/^[a-f0-9]{64}$/);
	expect(resolveStudioDesignReference(null, "ignored")).toEqual({
		designMd: null,
		designReference: null,
	});
});
