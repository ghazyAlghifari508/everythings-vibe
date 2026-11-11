import { describe, expect, it } from "vitest";
import { pruneStudioFrameSelection } from "../utils/studio-frame-selection";

describe("pruneStudioFrameSelection", () => {
	it("returns the same array when every target is still on the canvas", () => {
		const selected = ["f-1", "f-2"];
		// Same reference: a status poll must not re-render the composer.
		expect(pruneStudioFrameSelection(selected, ["f-1", "f-2", "f-3"])).toBe(
			selected,
		);
	});

	it("returns the same array when there is nothing selected", () => {
		const selected: string[] = [];
		expect(pruneStudioFrameSelection(selected, [])).toBe(selected);
	});

	it("drops a target whose frame was deleted or replaced", () => {
		expect(pruneStudioFrameSelection(["f-1", "ghost"], ["f-1"])).toEqual([
			"f-1",
		]);
	});

	it("drops every target when the canvas has no frames left", () => {
		expect(pruneStudioFrameSelection(["f-1", "f-2"], [])).toEqual([]);
	});

	it("keeps only ids of this canvas, never an id from another project", () => {
		// Selection storage is per project, so an id that belongs to a different
		// canvas is exactly as stale as a deleted frame.
		expect(pruneStudioFrameSelection(["other-project-frame"], ["f-1"])).toEqual(
			[],
		);
	});
});
