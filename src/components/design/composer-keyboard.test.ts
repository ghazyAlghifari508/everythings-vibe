import { describe, expect, it } from "vitest";
import { shouldSubmitComposerEvent } from "./composer-keyboard";

describe("shouldSubmitComposerEvent", () => {
	it("submits on a plain Enter key", () => {
		expect(shouldSubmitComposerEvent({ key: "Enter", shiftKey: false })).toBe(
			true,
		);
	});

	it("keeps Shift+Enter for new lines", () => {
		expect(shouldSubmitComposerEvent({ key: "Enter", shiftKey: true })).toBe(
			false,
		);
	});

	it("ignores non-Enter keys", () => {
		expect(shouldSubmitComposerEvent({ key: "a", shiftKey: false })).toBe(
			false,
		);
	});

	it("never submits while an IME composition is active", () => {
		expect(
			shouldSubmitComposerEvent({
				key: "Enter",
				shiftKey: false,
				isComposing: true,
			}),
		).toBe(false);
		expect(
			shouldSubmitComposerEvent({
				key: "Enter",
				shiftKey: false,
				nativeEvent: { isComposing: true },
			}),
		).toBe(false);
	});
});
