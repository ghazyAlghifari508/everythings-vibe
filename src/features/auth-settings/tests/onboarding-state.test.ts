import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearOnboardingState,
	getOnboardingState,
	saveOnboardingState,
} from "@/features/auth-settings/services/onboarding-state";

describe("onboarding draft persistence", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		vi.stubGlobal("window", {
			sessionStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
				removeItem: (key: string) => values.delete(key),
			},
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it("restores a wizard draft and explicitly clears it on completion", () => {
		const state = { step: 2, fullName: "Sample", role: "developer", goals: [] };
		expect(getOnboardingState()).toBeNull();
		saveOnboardingState(state);
		expect(getOnboardingState()).toEqual(state);
		clearOnboardingState();
		expect(getOnboardingState()).toBeNull();
	});

	it("degrades safely when browser storage is blocked", () => {
		vi.stubGlobal("window", {
			get sessionStorage() {
				throw new Error("Storage blocked");
			},
		});
		expect(getOnboardingState()).toBeNull();
		expect(() =>
			saveOnboardingState({ step: 1, fullName: "", role: "", goals: [] }),
		).not.toThrow();
		expect(clearOnboardingState).not.toThrow();
	});
});
