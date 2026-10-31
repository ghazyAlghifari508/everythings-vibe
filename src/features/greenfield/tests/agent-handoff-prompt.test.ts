import { describe, expect, it } from "vitest";
import { buildAgentHandoffPrompt } from "../services/agent-handoff-prompt";

describe("handoff placeholder substitution", () => {
	it("preserves artifacts literally without expanding embedded template markers", () => {
		const prd = "literal $& {apiKey} {projectId}";
		const prompt = buildAgentHandoffPrompt({
			payload: { projectName: "Sample", prd, ac: null, tasks: null },
			projectId: "project-sample",
			projectNameFallback: "Fallback",
			credential: { apiKey: "vibe_test_credential", expiresAt: null },
		});
		expect(prompt).toContain(prd);
		expect(prompt.split("vibe_test_credential")).toHaveLength(2);
	});
});
