import { afterEach, describe, expect, it, vi } from "vitest";
import { raceWithAbort } from "@/features/greenfield/services/abort-utils";

function makeController(): AbortController {
	return new AbortController();
}

afterEach(() => {
	vi.useRealTimers();
});

describe("raceWithAbort", () => {
	it("resolves with the underlying value when never aborted", async () => {
		const ctrl = makeController();
		const result = await raceWithAbort(Promise.resolve("docs"), ctrl.signal);
		expect(result).toBe("docs");
	});

	it("rejects immediately with an AbortError when signal is already aborted", async () => {
		const ctrl = makeController();
		ctrl.abort();

		await expect(
			raceWithAbort(new Promise<string>(() => {}), ctrl.signal),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("rejects with an AbortError when the signal fires mid-flight", async () => {
		vi.useFakeTimers();
		const ctrl = makeController();

		const never = new Promise<string>((resolve) => {
			setTimeout(() => resolve("too late"), 10_000);
		});
		const raced = raceWithAbort(never, ctrl.signal);

		const assertion = expect(raced).rejects.toMatchObject({
			name: "AbortError",
		});
		ctrl.abort();
		await assertion;
	});

	it("keeps the underlying promise running but stops waiting once aborted", async () => {
		vi.useFakeTimers();
		const ctrl = makeController();
		let settled = false;
		const slow = new Promise<string>((resolve) => {
			setTimeout(() => {
				settled = true;
				resolve("late");
			}, 5_000);
		});

		const raced = raceWithAbort(slow, ctrl.signal);
		const assertion = expect(raced).rejects.toMatchObject({
			name: "AbortError",
		});
		ctrl.abort();
		await assertion;
		expect(settled).toBe(false);
	});

	it("removes its abort listener after settling so late aborts are ignored", async () => {
		const ctrl = makeController();
		const addSpy = vi.spyOn(ctrl.signal, "addEventListener");
		const removeSpy = vi.spyOn(ctrl.signal, "removeEventListener");

		await raceWithAbort(Promise.resolve("ok"), ctrl.signal);

		const registered = addSpy.mock.calls.find(([type]) => type === "abort");
		expect(registered).toBeTruthy();
		expect(removeSpy).toHaveBeenCalledWith("abort", registered?.[1]);
	});
});
