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
