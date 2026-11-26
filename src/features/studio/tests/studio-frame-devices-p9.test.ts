// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	readStudioFrameDevices,
	studioFrameDeviceStorageKey,
	writeStudioFrameDevices,
} from "../services/studio-frame-devices";

const key = studioFrameDeviceStorageKey("user-1", "project-1");

describe("P9 viewport preference storage", () => {
	beforeEach(() => sessionStorage.clear());

	it("round-trips only devices belonging to existing frames", () => {
		writeStudioFrameDevices(key, { "frame-1": "mobile", "frame-2": "tablet" });
		expect(readStudioFrameDevices(key, ["frame-1", "frame-3"])).toEqual({
			"frame-1": "mobile",
		});
	});

	it("ignores corrupt or unknown payloads instead of breaking the canvas", () => {
		sessionStorage.setItem(key, "not json");
		expect(readStudioFrameDevices(key, ["frame-1"])).toEqual({});
		sessionStorage.setItem(key, JSON.stringify({ "frame-1": "watch" }));
		expect(readStudioFrameDevices(key, ["frame-1"])).toEqual({});
	});

	it("uses a distinct bucket for every user and project", () => {
		expect(studioFrameDeviceStorageKey("u1", "p1")).not.toBe(
			studioFrameDeviceStorageKey("u2", "p1"),
		);
		expect(studioFrameDeviceStorageKey("u1", "p1")).not.toBe(
			studioFrameDeviceStorageKey("u1", "p2"),
		);
	});
});
