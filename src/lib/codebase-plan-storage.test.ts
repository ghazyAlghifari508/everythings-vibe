// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearPlanCodebasePointer,
	clearPlanCodebasePointerIfMatches,
	clearPlanCodebaseProjectPointer,
	readPlanCodebasePointer,
	readPlanCodebaseProjectPointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
} from "./codebase-plan-storage";
import {
	PLAN_CODEBASE_ID_STORAGE_KEY,
	PLAN_CODEBASE_NAME_STORAGE_KEY,
	PLAN_CODEBASE_PROJECT_STORAGE_KEY,
} from "./codebase-sync";

beforeEach(() => {
	sessionStorage.clear();
});

afterEach(() => {
	sessionStorage.clear();
});

describe("plan codebase pointer", () => {
	it("round-trips the id and name", () => {
		storePlanCodebasePointer("cb-1", "react-movie-app");

		expect(readPlanCodebasePointer()).toEqual({
			id: "cb-1",
			name: "react-movie-app",
		});
	});

	it("returns null when nothing is stored", () => {
		expect(readPlanCodebasePointer()).toBeNull();
	});

	it("reports a missing name as null instead of inventing a placeholder", () => {
		sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, "cb-1");

		// The server is the source of truth; a pointer must never backfill a
		// display name the way the old `"Repository Lokal"` fallback did.
		expect(readPlanCodebasePointer()).toEqual({ id: "cb-1", name: null });
	});

	it("clears the id and the name together", () => {
		storePlanCodebasePointer("cb-1", "react-movie-app");
		clearPlanCodebasePointer();

		expect(readPlanCodebasePointer()).toBeNull();
		expect(sessionStorage.getItem(PLAN_CODEBASE_NAME_STORAGE_KEY)).toBeNull();
	});
});

describe("plan codebase project pointer", () => {
	it("round-trips the project id", () => {
		storePlanCodebaseProjectPointer("proj-1");

		expect(readPlanCodebaseProjectPointer()).toBe("proj-1");
	});

	it("treats a blank stored value as absent", () => {
		sessionStorage.setItem(PLAN_CODEBASE_PROJECT_STORAGE_KEY, "   ");

		expect(readPlanCodebaseProjectPointer()).toBeNull();
	});

	it("clears the project pointer on its own", () => {
		storePlanCodebasePointer("cb-1", "react-movie-app");
		storePlanCodebaseProjectPointer("proj-1");

		clearPlanCodebaseProjectPointer();

		expect(readPlanCodebaseProjectPointer()).toBeNull();
		expect(readPlanCodebasePointer()).toEqual({
			id: "cb-1",
			name: "react-movie-app",
		});
	});
});

describe("clearPlanCodebasePointerIfMatches", () => {
	it("clears the codebase and project pointers for the deleted codebase", () => {
		storePlanCodebasePointer("cb-1", "react-movie-app");
		storePlanCodebaseProjectPointer("proj-1");

		expect(clearPlanCodebasePointerIfMatches("cb-1")).toBe(true);
		expect(readPlanCodebasePointer()).toBeNull();
		expect(readPlanCodebaseProjectPointer()).toBeNull();
	});

	it("leaves an unrelated codebase's pointers untouched", () => {
		storePlanCodebasePointer("cb-2", "clipperbintang");
		storePlanCodebaseProjectPointer("proj-2");

		expect(clearPlanCodebasePointerIfMatches("cb-1")).toBe(false);
		expect(readPlanCodebasePointer()).toEqual({
			id: "cb-2",
			name: "clipperbintang",
		});
		expect(readPlanCodebaseProjectPointer()).toBe("proj-2");
	});

	it("clears the codebase pointer when no name was stored for it", () => {
		sessionStorage.setItem(PLAN_CODEBASE_ID_STORAGE_KEY, "cb-1");

		expect(clearPlanCodebasePointerIfMatches("cb-1")).toBe(true);
		expect(readPlanCodebasePointer()).toBeNull();
	});

	it("does nothing when there is no stored pointer at all", () => {
		expect(clearPlanCodebasePointerIfMatches("cb-1")).toBe(false);
	});

	it("never touches unrelated application storage", () => {
		storePlanCodebasePointer("cb-1", "react-movie-app");
		sessionStorage.setItem("unrelated:key", "keep-me");

		clearPlanCodebasePointerIfMatches("cb-1");

		expect(sessionStorage.getItem("unrelated:key")).toBe("keep-me");
	});
});
