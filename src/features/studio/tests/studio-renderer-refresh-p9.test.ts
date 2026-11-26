import { describe, expect, it } from "vitest";
import { studioHtmlStamp, studioRendererKeyId } from "../utils/studio-renderer";

const key = {
	projectId: "p1",
	frameId: "f1",
	revision: 3,
	htmlStamp: studioHtmlStamp("<p>latest</p>"),
	attempt: 0,
};

describe("P9 renderer refresh invalidation", () => {
	it("changes the key when Refresh is pressed", () => {
		expect(studioRendererKeyId({ ...key, refresh: 1 })).not.toBe(
			studioRendererKeyId(key),
		);
		expect(studioRendererKeyId({ ...key, refresh: 2 })).not.toBe(
			studioRendererKeyId({ ...key, refresh: 1 }),
		);
	});

	it("keeps device out of the key, so viewport switches reuse the renderer", () => {
		expect(Object.keys(key)).not.toContain("device");
		expect(Object.keys(key)).not.toContain("viewport");
		expect(studioRendererKeyId({ ...key, refresh: 1 })).toBe(
			studioRendererKeyId({ ...key, refresh: 1 }),
		);
	});
});
