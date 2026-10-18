import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	consumeResumeIntent,
	saveResumeIntent,
} from "@/features/billing/services/payment-resume";

describe("payment resume intent", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		vi.stubGlobal("window", {
			sessionStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
		});
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("resumes the matching project exactly once", () => {
		saveResumeIntent("project-a", "ac");
		expect(consumeResumeIntent("project-a")).toBe("ac");
		expect(consumeResumeIntent("project-a")).toBeNull();
	});

	it("does not resume another project and consumes a mismatched intent", () => {
		saveResumeIntent("project-a", "prd");
		expect(consumeResumeIntent("project-b")).toBeNull();
		expect(consumeResumeIntent("project-a")).toBeNull();
	});

	it("rejects expired intents without leaving stale state", () => {
		saveResumeIntent("project-a", "task");
		vi.advanceTimersByTime(15 * 60 * 1000 + 1);
		expect(consumeResumeIntent("project-a")).toBeNull();
		expect(consumeResumeIntent("project-a")).toBeNull();
	});
});
