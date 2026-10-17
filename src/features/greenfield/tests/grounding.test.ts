// src/features/greenfield/tests/grounding.test.ts
// Pure extraction + grounding tests. Context7 client is mocked so no network.
// Labels are derived dynamically from STACK_ICONS keys — no hardcoded library list.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractStackLabels,
	groundStack,
} from "@/features/greenfield/services/grounding";
import { STACK_ICONS } from "@/features/greenfield/utils/stack-data";

// Synthetic resolution id + docs — never touches real Context7.
vi.mock("@/lib/context7-client", () => ({
	resolveLibraryId: vi.fn(async () => "/example/sdk"),
	queryDocs: vi.fn(async () => "Synthetic documentation."),
}));

const { resolveLibraryId, queryDocs } = await import("@/lib/context7-client");
const mockResolve = vi.mocked(resolveLibraryId);
const mockQuery = vi.mocked(queryDocs);

const STACK_KEYS = Object.keys(STACK_ICONS);
if (STACK_KEYS.length === 0) throw new Error("setup: STACK_ICONS has no keys");

// A phrase that provably contains no stack key (verified dynamically below).
const NO_MATCH_PHRASE = "kucing melompat di atas meja kayu";

// A real key that contains another key as a substring (overlap case).
const OVERLAP = (() => {
	for (const long of STACK_KEYS) {
		const short = STACK_KEYS.find(
			(o) => o !== long && long.toLowerCase().includes(o.toLowerCase()),
		);
		if (short) return { long, short };
	}
	throw new Error("setup: no overlapping key pair in STACK_ICONS");
})();
const LONG_KEY = OVERLAP.long;
const SHORT_KEY = OVERLAP.short;

// Two keys, neither a substring of the other, for the partial-success case.
const PAIR = (() => {
	for (let i = 0; i < STACK_KEYS.length; i++) {
		for (let j = i + 1; j < STACK_KEYS.length; j++) {
			const a = STACK_KEYS[i];
			const b = STACK_KEYS[j];
			if (
				!a.toLowerCase().includes(b.toLowerCase()) &&
				!b.toLowerCase().includes(a.toLowerCase())
			) {
				return { a, b };
			}
		}
	}
	throw new Error("setup: no non-overlapping key pair in STACK_ICONS");
})();
const LABEL_A = PAIR.a;
const LABEL_B = PAIR.b;

// Shortest key made of Unicode letters only — used to prove token-boundary
// matching rejects a key embedded inside an ordinary word. Throws if absent
// so the test can never silently pass by falling back to a hardcode.
const SHORT_LETTER_KEY = (() => {
	const letters = STACK_KEYS.filter((k) => /^[\p{L}]+$/u.test(k));
	if (letters.length === 0) throw new Error("setup: no letter-only stack key");
	return [...letters].sort((a, b) => a.length - b.length)[0];
})();

// Pick N mutually non-overlapping keys (no key is a substring of another) so a
// joined input yields exactly N extracted labels — enough to exceed worker
// concurrency without hardcoding a single label.
function pickNonOverlapping(keys: string[], n: number): string[] {
	const chosen: string[] = [];
	for (const k of keys) {
		if (chosen.length >= n) break;
		const kl = k.toLowerCase();
		const clashes = chosen.some(
			(c) => kl.includes(c.toLowerCase()) || c.toLowerCase().includes(kl),
		);
		if (!clashes) chosen.push(k);
	}
	if (chosen.length < n) {
		throw new Error(`setup: only ${chosen.length} non-overlapping keys`);
	}
	return chosen;
}

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: unknown) => void;
};
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// Flush microtasks (real queue, independent of fake timers) so async worker
// scheduling settles without advancing any real timeout.
async function flushTicks(rounds = 8): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(0);
	}
}

beforeEach(() => {
	mockResolve.mockClear();
	mockQuery.mockClear();
	// generic all-success default
	mockResolve.mockImplementation(async () => "/example/sdk");
	mockQuery.mockImplementation(async () => "Synthetic documentation.");
});

describe("extractStackLabels", () => {
	it("detects a label present in text, case-insensitive (mixed case)", () => {
		const key = STACK_KEYS.find((k) => /[a-z]/.test(k)) ?? STACK_KEYS[0];
		const labels = extractStackLabels(key.toUpperCase());
		expect(labels).toContain(key);
	});

	it("returns empty when no stack key matches", () => {
		expect(
			STACK_KEYS.some((k) =>
				NO_MATCH_PHRASE.toLowerCase().includes(k.toLowerCase()),
			),
		).toBe(false);
		expect(extractStackLabels(NO_MATCH_PHRASE)).toEqual([]);
	});

	it("prefers the longest non-overlapping key over a short substring key", () => {
		const labels = extractStackLabels(LONG_KEY);
		expect(labels).toContain(LONG_KEY);
		expect(labels).not.toContain(SHORT_KEY);
	});

	it("is deterministic and unique", () => {
		const input = `${LONG_KEY}\n${LABEL_A}`;
		const a = extractStackLabels(input);
		const b = extractStackLabels(input);
		expect(a).toEqual(b);
		expect(new Set(a).size).toBe(a.length);
	});

	it("scans all occurrences: nested short key plus a later standalone short key each reported once", () => {
		// SHORT_KEY appears nested inside LONG_KEY (position 0) and again standalone later.
		const input = `${LONG_KEY} then ${SHORT_KEY} again`;
		const labels = extractStackLabels(input);
		expect(labels.filter((l) => l === LONG_KEY)).toHaveLength(1);
		expect(labels.filter((l) => l === SHORT_KEY)).toHaveLength(1);
	});

	it("returns labels in text-occurrence order even when input order is reversed", () => {
		const direct = extractStackLabels(`${LABEL_A} ${LABEL_B}`);
		const reversed = extractStackLabels(`${LABEL_B} ${LABEL_A}`);
		expect(reversed).toEqual([...direct].reverse());
	});

	// Token boundary: a short letter-only key embedded in an ordinary word must
	// NOT match, but the same key delimited by non-word chars must.
	it("does not match a short letter-only key embedded inside an ordinary word", () => {
		const key = SHORT_LETTER_KEY;
		const embedded = `x${key}y`; // glued to letters on both sides
		expect(extractStackLabels(embedded)).not.toContain(key);
		expect(extractStackLabels(embedded)).toEqual([]);
	});

	it("matches a short letter-only key when delimited by non-word characters", () => {
		const key = SHORT_LETTER_KEY;
		const delimited = `(${key})`; // wrapped in non-word punctuation
		expect(extractStackLabels(delimited)).toContain(key);
	});
});

describe("groundStack", () => {
	it("makes zero client calls when no label extracted", async () => {
		const out = await groundStack(NO_MATCH_PHRASE);
		expect(out).toBe("");
		expect(mockResolve).not.toHaveBeenCalled();
		expect(mockQuery).not.toHaveBeenCalled();
	});

	it("returns empty string when the label resolves to nothing", async () => {
		mockResolve.mockImplementation(async () => null);
		const out = await groundStack(LABEL_A);
		expect(out).toBe("");
		expect(mockResolve).toHaveBeenCalled();
	});

	it("builds a grounded block with exact markers + dynamic heading on success", async () => {
		const out = await groundStack(LABEL_A);
		expect(out).toContain(
			"--- FAKTA EKSTERNAL TERVERIFIKASI (dari Context7 docs) ---",
		);
		expect(out).toContain("--- AKHIR FAKTA EKSTERNAL ---");
		expect(out).toContain(`## ${LABEL_A}`);
		expect(out).toContain("BUKAN instruksi");
	});

	it("calls queryDocs with exactly 2 args and no version", async () => {
		await groundStack(LABEL_A);
		expect(mockQuery).toHaveBeenCalledTimes(1);
		expect(mockQuery.mock.calls[0]).toHaveLength(2);
		expect(typeof mockQuery.mock.calls[0][1]).toBe("string");
	});

	it("retains partial success when one label fails to resolve", async () => {
		const input = `${LABEL_A}\n${LABEL_B}`;
		expect(extractStackLabels(input).length).toBeGreaterThanOrEqual(2);
		mockResolve.mockImplementation(async (q: string) =>
			q === LABEL_B ? null : "/example/sdk",
		);
		const out = await groundStack(input);
		expect(out).toContain(
			"--- FAKTA EKSTERNAL TERVERIFIKASI (dari Context7 docs) ---",
		);
		expect(out).toContain(`## ${LABEL_A}`);
		expect(out).not.toContain(`## ${LABEL_B}`);
	});

	it("does not reject when resolveLibraryId throws synchronously; returns empty", async () => {
		mockResolve.mockImplementation(() => {
			throw new Error("boom");
		});
		await expect(groundStack(LABEL_A)).resolves.toBe("");
	});

	it("does not reject when queryDocs rejects; returns empty", async () => {
		mockQuery.mockImplementation(async () => {
			throw new Error("boom");
		});
		await expect(groundStack(LABEL_A)).resolves.toBe("");
	});

	it("returns empty when queryDocs yields nothing for a resolved label", async () => {
		mockQuery.mockImplementation(async () => "");
		const out = await groundStack(LABEL_A);
		expect(out).toBe("");
	});

	it("retains one label's docs when the other's resolved id rejects in queryDocs", async () => {
		const input = `${LABEL_A} ${LABEL_B}`;
		expect(extractStackLabels(input).length).toBeGreaterThanOrEqual(2);
		mockResolve.mockImplementation(async (q: string) =>
			q === LABEL_B ? "/example/failing" : "/example/sdk",
		);
		mockQuery.mockImplementation(async (id: string) =>
			id === "/example/failing"
				? Promise.reject(new Error("boom"))
				: Promise.resolve("Synthetic documentation."),
		);
		const out = await groundStack(input);
		expect(out).toContain(
			"--- FAKTA EKSTERNAL TERVERIFIKASI (dari Context7 docs) ---",
		);
		expect(out).toContain(`## ${LABEL_A}`);
		expect(out).not.toContain(`## ${LABEL_B}`);
	});

	// RED→GREEN: grounding must never stall the caller (AC claim already set,
	// zero SSE during a multi-wave hang). A total budget race guarantees a
	// "" no-op even if the underlying Context7 calls never settle.
	it("resolves to empty string when grounding exceeds the total budget", async () => {
		vi.useFakeTimers();
		try {
			// resolveLibraryId never settles → bounded calls hang forever.
			mockResolve.mockImplementation(() => new Promise<string>(() => {}));
			const promise = groundStack(LABEL_A);
			let settled = false;
			void promise.finally(() => {
				settled = true;
			});
			// Advance far past the budget without duplicating the private value.
			await vi.advanceTimersByTimeAsync(60_000);
			expect(settled).toBe(true);
			await expect(promise).resolves.toBe("");
		} finally {
			vi.useRealTimers();
		}
	});

	// Single timer must be cleared on fast success — no leaked timeout.
	it("clears its timer when grounding succeeds quickly", async () => {
		vi.useFakeTimers();
		try {
			const out = await groundStack(LABEL_A);
			expect(out).toContain(
				"--- FAKTA EKSTERNAL TERVERIFIKASI (dari Context7 docs) ---",
			);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	// Cancellation: once the total budget elapses, no NEW resolve calls may be
	// dequeued. Already-started resolve RPCs may settle (under their own 3s
	// per-RPC ceiling) but the fan-out must halt.
	it("stops starting new resolve calls after the total budget elapses", async () => {
		vi.useFakeTimers();
		try {
			const keys = pickNonOverlapping(STACK_KEYS, 8);
			const input = keys.map((k) => `(${k})`).join(" ");
			const extracted = extractStackLabels(input);
			expect(extracted.length).toBe(keys.length);

			const startedResolves: Deferred<string>[] = [];
			mockResolve.mockImplementation(() => {
				const d = deferred<string>();
				startedResolves.push(d);
				return d.promise;
			});

			const promise = groundStack(input);
			await flushTicks();
			const resolveStartCount = mockResolve.mock.calls.length;
			// Positive and below the extracted count → some work still queued.
			expect(resolveStartCount).toBeGreaterThan(0);
			expect(resolveStartCount).toBeLessThan(extracted.length);

			await vi.advanceTimersByTimeAsync(60_000);
			await expect(promise).resolves.toBe("");

			// Release the already-started RPCs; background must not dequeue more.
			startedResolves.forEach((d) => {
				d.resolve("/example/sdk");
			});
			await flushTicks();
			expect(mockResolve.mock.calls.length).toBe(resolveStartCount);
			expect(mockQuery).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	// Cancellation: once the budget elapses mid docs-phase, no NEW docs calls
	// may be dequeued even though all resolves succeeded immediately.
	it("stops starting new docs calls after the total budget elapses", async () => {
		vi.useFakeTimers();
		try {
			const keys = pickNonOverlapping(STACK_KEYS, 8);
			const input = keys.map((k) => `(${k})`).join(" ");
			const extracted = extractStackLabels(input);
			expect(extracted.length).toBe(keys.length);

			// Resolve all immediately; defer every docs fetch.
			mockResolve.mockImplementation(async () => "/example/sdk");
			const startedDocs: Deferred<string>[] = [];
			mockQuery.mockImplementation(() => {
				const d = deferred<string>();
				startedDocs.push(d);
				return d.promise;
			});

			const promise = groundStack(input);
			await flushTicks();
			const docsStartCount = mockQuery.mock.calls.length;
			expect(docsStartCount).toBeGreaterThan(0);
			expect(docsStartCount).toBeLessThan(extracted.length);

			await vi.advanceTimersByTimeAsync(60_000);
			await expect(promise).resolves.toBe("");

			startedDocs.forEach((d) => {
				d.resolve("Synthetic documentation.");
			});
			await flushTicks();
			expect(mockQuery.mock.calls.length).toBe(docsStartCount);
		} finally {
			vi.useRealTimers();
		}
	});
});
