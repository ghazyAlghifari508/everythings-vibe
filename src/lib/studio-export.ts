import JSZip from "jszip";
import type { StudioFrameRow } from "@/db/schema";
import { extractCleanHtml } from "@/lib/clean-html";

export function sanitizeFilename(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 50) || "screen"
	);
}

export async function exportProjectAsZip(
	projectTitle: string,
	frames: StudioFrameRow[],
): Promise<void> {
	const zip = new JSZip();
	const readyFrames = frames.filter((f) => f.status === "ready" && f.htmlCode);

	if (readyFrames.length === 0) return;

	readyFrames.forEach((frame, index) => {
		const clean = extractCleanHtml(frame.htmlCode ?? "");
		const filename = `${index + 1}-${sanitizeFilename(frame.name)}.html`;
		zip.file(filename, clean);
		if (index === 0) {
			zip.file("index.html", clean);
		}
	});

	const manifest = {
		title: projectTitle,
		exportedAt: new Date().toISOString(),
		screens: readyFrames.map((f, i) => ({
			order: i + 1,
			name: f.name,
			viewport: f.viewport,
			file: `${i + 1}-${sanitizeFilename(f.name)}.html`,
		})),
	};
	zip.file("project-manifest.json", JSON.stringify(manifest, null, 2));

	const blob = await zip.generateAsync({ type: "blob" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${sanitizeFilename(projectTitle)}-screens.zip`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
