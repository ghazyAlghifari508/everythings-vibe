export type DiffLine = {
	type: "added" | "removed" | "unchanged";
	text: string;
};

// ponytail: LCS diff so an insertion mid-document doesn't flag every following
// line as changed. O(n*m) DP fine at PRD scale (~300 lines → ~80k cells).
export function computeDiff(oldStr: string, newStr: string): DiffLine[] {
	if (oldStr === "" && newStr === "") return [];
	const a = oldStr ? oldStr.split("\n") : [];
	const b = newStr ? newStr.split("\n") : [];
	const n = a.length;
	const m = b.length;
	const result: DiffLine[] = [];

	// lcs[i][j] = LCS length of a[i..] vs b[j..]
	const lcs: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] =
				a[i] === b[j]
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			result.push({ type: "unchanged", text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			result.push({ type: "removed", text: a[i] });
			i++;
		} else {
			result.push({ type: "added", text: b[j] });
			j++;
		}
	}
	while (i < n) {
		result.push({ type: "removed", text: a[i] });
		i++;
	}
	while (j < m) {
		result.push({ type: "added", text: b[j] });
		j++;
	}
	return result;
}

export interface ComparableVersion {
	version: number;
	content: string;
}

export interface ComparePair {
	oldVersion: number;
	newVersion: number;
	oldContent: string;
	newContent: string;
}

// ponytail: "compare changes" always resolves to persisted records, never to
// the live/streaming canvas. Direction is explicit old → new so the existing
// added/removed semantics stay truthful even when the earliest version is
// selected or the list is non-contiguous.
export function resolveComparePair(
	versions: readonly ComparableVersion[],
	selectedVersion?: number,
): ComparePair | null {
	const byNumber = new Map<number, ComparableVersion>();
	for (const version of versions) {
		if (
			!Number.isInteger(version.version) ||
			version.version < 1 ||
			typeof version.content !== "string" ||
			byNumber.has(version.version)
		) {
			continue;
		}
		byNumber.set(version.version, version);
	}
	if (byNumber.size < 2) return null;

	const ordered = [...byNumber.values()].sort((a, b) => a.version - b.version);
	const current =
		(selectedVersion !== undefined
			? byNumber.get(selectedVersion)
			: undefined) ?? ordered[ordered.length - 1];
	if (!current) return null;

	// Existing policy: selected version against the closest earlier revision.
	for (let index = ordered.length - 1; index >= 0; index--) {
		const candidate = ordered[index];
		if (candidate && candidate.version < current.version) {
			return {
				oldVersion: candidate.version,
				newVersion: current.version,
				oldContent: candidate.content,
				newContent: current.content,
			};
		}
	}

	// Earliest selected: the only sensible persisted neighbour is a newer one.
	const next = ordered.find((version) => version.version > current.version);
	if (!next) return null;
	return {
		oldVersion: current.version,
		newVersion: next.version,
		oldContent: current.content,
		newContent: next.content,
	};
}
