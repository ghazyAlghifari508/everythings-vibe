/**
 * Pure helpers for the read-only source preview in the existing-codebase
 * workspace.
 *
 * Two audiences, one contract:
 * - the server reassembles bounded, verified content from a persisted snapshot;
 * - the browser renders it as inert text.
 *
 * Nothing here touches the database or the network, so every boundary
 * (chunk completeness, truncation, binary detection, language mapping) is
 * unit-testable without either.
 */

export interface SnapshotFileChunk {
	chunkIndex: number;
	chunkTotal: number | null;
	data: string;
}

/**
 * Reassemble an uploaded file from its base64 chunks.
 *
 * Returns `null` when the chunk set is incomplete or out of order bounds, so a
 * partially stored file is reported honestly instead of silently rendered as
 * if it were whole. Sparse array indexing would otherwise turn a missing chunk
 * into an empty string and quietly corrupt the preview.
 */
export function assembleSnapshotFileChunks(
	chunks: readonly SnapshotFileChunk[],
): string | null {
	if (chunks.length === 0) return null;
	const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
	const declaredTotals = new Set(
		ordered.map((chunk) => chunk.chunkTotal).filter((total) => total !== null),
	);
	if (declaredTotals.size !== 1) return null;
	const [chunkTotal] = declaredTotals;
	if (chunkTotal === undefined || chunkTotal <= 0) return null;
	if (ordered.length !== chunkTotal) return null;
	for (let index = 0; index < chunkTotal; index++) {
		if (ordered[index]?.chunkIndex !== index) return null;
		if (!ordered[index]?.data) return null;
	}
	return ordered.map((chunk) => chunk.data).join("");
}

/**
 * Clip decoded content to a character budget on a line boundary.
 *
 * Clipping mid-line would produce a final "line" that was never in the file
 * and would desynchronize the reported line count, so the cut always lands on
 * the last newline inside the budget.
 */
export function truncatePreviewContent(
	content: string,
	maxChars: number,
): { content: string; truncated: boolean } {
	if (content.length <= maxChars) return { content, truncated: false };
	const slice = content.slice(0, maxChars);
	const lastNewline = slice.lastIndexOf("\n");
	const kept = lastNewline > 0 ? slice.slice(0, lastNewline + 1) : slice;
	return { content: kept, truncated: true };
}

/**
 * Snapshot upload carries base64 text, but a mis-declared payload can still
 * decode to bytes that are not text. C0 controls (including NUL) and DEL mean
 * the content is not displayable source; tab, newline, and carriage return are
 * legal formatting and stay allowed. Checked over code points so the pattern
 * carries no control-character literal.
 */
export function isDisplayableTextContent(content: string): boolean {
	for (const char of content) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
		if (code < 0x20 || code === 0x7f) return false;
	}
	return true;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	jsonc: "json",
	css: "css",
	scss: "scss",
	less: "less",
	html: "xml",
	htm: "xml",
	xml: "xml",
	svg: "xml",
	vue: "xml",
	svelte: "xml",
	astro: "xml",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	php: "php",
	cs: "csharp",
	sql: "sql",
	prisma: "sql",
	graphql: "graphql",
	gql: "graphql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	yml: "yaml",
	yaml: "yaml",
	toml: "ini",
	ini: "ini",
	env: "ini",
	dockerfile: "dockerfile",
	md: "markdown",
	mdx: "markdown",
	diff: "diff",
	patch: "diff",
};

/** highlight.js language for a repository path, or null when unsupported. */
export function detectSourceLanguage(path: string): string | null {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	if (dot <= 0)
		return name.toLowerCase() === "dockerfile" ? "dockerfile" : null;
	const extension = name.slice(dot + 1).toLowerCase();
	return LANGUAGE_BY_EXTENSION[extension] ?? null;
}

/** Last path segment of a repository-relative path. */
export function sourceFileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
