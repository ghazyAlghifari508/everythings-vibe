import { describe, expect, it } from "vitest";
import { parseStreamEvent } from "./sse-events";

describe("parseStreamEvent", () => {
	it("parses thinking events with typed content", () => {
		const event = parseStreamEvent(
			JSON.stringify({ type: "thinking", content: "reasoning..." }),
		);
		expect(event).toEqual({ type: "thinking", content: "reasoning..." });
	});

	it("parses the thinking_reset signal", () => {
		expect(
			parseStreamEvent(JSON.stringify({ type: "thinking_reset" })),
		).toEqual({ type: "thinking_reset" });
	});

	it("parses delta events with typed content", () => {
		const event = parseStreamEvent(
			JSON.stringify({ type: "delta", content: "AC text" }),
		);
		expect(event).toEqual({ type: "delta", content: "AC text" });
	});

	it("parses done events carrying extra payloads", () => {
		const event = parseStreamEvent(
			JSON.stringify({ type: "done", taskTree: { features: [] } }),
		);
		expect(event?.type).toBe("done");
	});

	it("parses error events with optional message", () => {
		const event = parseStreamEvent(
			JSON.stringify({ type: "error", error: "Gagal" }),
		);
		expect(event?.type).toBe("error");
	});

	it("returns null for malformed JSON instead of throwing", () => {
		expect(parseStreamEvent("not json{{")).toBeNull();
	});

	it("returns null for unknown event types instead of throwing", () => {
		expect(
			parseStreamEvent(JSON.stringify({ type: "progress", pct: 42 })),
		).toBeNull();
	});

	it("returns null when thinking content is missing", () => {
		expect(parseStreamEvent(JSON.stringify({ type: "thinking" }))).toBeNull();
	});
});
