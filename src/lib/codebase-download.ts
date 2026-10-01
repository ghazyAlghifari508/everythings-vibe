export type ArtifactMimeType = "application/json" | "text/markdown";

export interface DownloadArtifactInput {
	fileName: string;
	content: string;
	mimeType: ArtifactMimeType;
}

export function artifactMimeTypeFor(fileName: string): ArtifactMimeType {
	return fileName.toLowerCase().endsWith(".json")
		? "application/json"
		: "text/markdown";
}

function buildAnchor(fileName: string, blob: Blob): HTMLAnchorElement {
	const anchor = document.createElement("a");
	anchor.href = URL.createObjectURL(blob);
	anchor.download = fileName;
	anchor.rel = "noopener";
	anchor.style.display = "none";
	return anchor;
}

/**
 * Client-side artifact download. Writes the real artifact bytes into a Blob
 * and triggers an actual browser download — no fake buttons, no stopPropagation
 * theater. Returns false when the browser blocks the download (e.g. tests
 * without a DOM body) so callers can surface an honest failure.
 */
export function downloadArtifact({
	fileName,
	content,
	mimeType,
}: DownloadArtifactInput): boolean {
	if (typeof document === "undefined" || typeof URL === "undefined") return false;
	const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
	const anchor = buildAnchor(fileName, blob);
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(anchor.href), 4000);
	return true;
}

export function downloadJsonArtifact(fileName: string, data: unknown): boolean {
	return downloadArtifact({
		fileName,
		content: JSON.stringify(data, null, 2),
		mimeType: "application/json",
	});
}

export function downloadMarkdownArtifact(fileName: string, content: string): boolean {
	return downloadArtifact({
		fileName,
		content,
		mimeType: "text/markdown",
	});
}
