import { describe, expect, it } from "vitest";
import {
	buildStudioPreviewTarget,
	studioPreviewSearchSchema,
} from "../types/studio-preview-contract";

describe("P9 P10 preview contract", () => {
	it("encodes the authorized project, frame and viewport in a validated target", () => {
		const target = buildStudioPreviewTarget({
			projectId: "project/42",
			frameId: "frame 1",
			device: "mobile",
			returnTo: "/design/project%2F42",
		});
		expect(target.href).toBe(
			"/design/project%2F42/preview?frameId=frame+1&device=mobile&returnTo=%2Fdesign%2Fproject%252F42",
		);
		expect(target.search).toEqual({
			frameId: "frame 1",
			device: "mobile",
			returnTo: "/design/project%2F42",
		});
		expect(target.routeAvailable).toBe(false);
		expect(target.unavailableReason).toBeTruthy();
	});

	it("reports availability only when the route is really provided", () => {
		const target = buildStudioPreviewTarget({
			projectId: "p1",
			frameId: "f1",
			device: "tablet",
			routeAvailable: true,
		});
		expect(target.routeAvailable).toBe(true);
		expect(target.unavailableReason).toBeUndefined();
	});

	it("rejects unknown devices and extra search keys", () => {
		expect(
			studioPreviewSearchSchema.safeParse({
				frameId: "f1",
				device: "watch",
				returnTo: "/design/p1",
			}).success,
		).toBe(false);
		expect(
			studioPreviewSearchSchema.safeParse({
				frameId: "f1",
				device: "desktop",
				returnTo: "/design/p1",
				injected: true,
			}).success,
		).toBe(false);
	});
});
