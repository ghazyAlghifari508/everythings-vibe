/**
 * Pure timing helpers for ThoughtLine. Every duration is measured from a
 * recorded epoch, so an invalid timestamp falls back instead of inventing a
 * duration.
 */

export function resolveStartEpoch(
	value: number | string | Date | undefined,
	fallback: number,
): number {
	if (value === undefined) return fallback;
	const epoch =
		value instanceof Date
			? value.getTime()
			: typeof value === "number"
				? value
				: Date.parse(value);
	return Number.isFinite(epoch) ? epoch : fallback;
}

export function normalizeSettledDeciseconds(
	finishedAt: number | string | Date | null | undefined,
	startedAtEpoch: number,
): number | null {
	if (finishedAt === undefined || finishedAt === null) return null;
	return Math.max(
		0,
		(resolveStartEpoch(finishedAt, Date.now()) - startedAtEpoch) / 100,
	);
}

// Deciseconds keep the sub-second precision ReactBits shows without drift.
export function formatElapsed(deciseconds: number): string {
	return deciseconds < 600
		? `${(deciseconds / 10).toFixed(1)}s`
		: `${Math.floor(deciseconds / 600)}m ${((deciseconds % 600) / 10).toFixed(1)}s`;
}

export function spokenElapsed(deciseconds: number): string {
	const seconds = (deciseconds / 10).toFixed(1);
	if (deciseconds < 600) return `${seconds} detik`;
	return `${Math.floor(deciseconds / 600)} menit ${((deciseconds % 600) / 10).toFixed(1)} detik`;
}
