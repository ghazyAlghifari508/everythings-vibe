import { describe, expect, it, vi } from "vitest";
import { studioSearchSchema } from "@/routes/design/studio.index";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (fn: unknown) => fn,
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(),
}));

describe("studioSearchSchema", () => {
	it("accepts a template prompt for studio prefill", () => {
		expect(studioSearchSchema.parse({ prompt: "Buatkan dashboard" })).toEqual({
			prompt: "Buatkan dashboard",
		});
	});

	it("accepts an empty search for direct visits", () => {
		expect(studioSearchSchema.parse({})).toEqual({});
	});

	it("rejects a non-string prompt instead of prefilling silently", () => {
		expect(() => studioSearchSchema.parse({ prompt: 42 })).toThrow();
	});

	it("accepts an optional recorded origin for the back control", () => {
		expect(studioSearchSchema.parse({ from: "/design" })).toEqual({
			from: "/design",
		});
	});

	it("rejects a non-string origin instead of trusting it", () => {
		expect(() => studioSearchSchema.parse({ from: 42 })).toThrow();
	});
});
