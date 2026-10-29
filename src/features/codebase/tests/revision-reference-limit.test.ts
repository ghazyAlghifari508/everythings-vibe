import { describe, expect, it } from "vitest";
import { revisionReferencesFit } from "../services/revision-references";
import { CODEBASE_GENERATION_MAX_CONTEXT_CHARS } from "../types/codebase-constants";

describe("revision reference budget", () => {
	it("counts requested files only and rejects a total beyond the context budget", () => {
		const entries = [
			{ path: "a", size: CODEBASE_GENERATION_MAX_CONTEXT_CHARS },
			{ path: "b", size: 1 },
		];
		expect(revisionReferencesFit(["a"], entries)).toBe(true);
		expect(revisionReferencesFit(["a", "b"], entries)).toBe(false);
	});
});
