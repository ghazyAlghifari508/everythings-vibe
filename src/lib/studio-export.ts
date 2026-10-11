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

	// Detect if any frame references a studio asset (such as uploaded logo)
	const assetMap = new Map<string, string>();
	const assetUrlRegex = /\/api\/studio\/asset\?[^"'\s<>]+/g;
	const foundUrls = new Set<string>();

	for (const frame of readyFrames) {
		const matches = (frame.htmlCode ?? "").match(assetUrlRegex);
		if (matches) {
			for (const url of matches) foundUrls.add(url);
		}
	}

	for (const url of foundUrls) {
		try {
			const res = await fetch(url);
			if (res.ok) {
				const blob = await res.blob();
				const mime = blob.type || "image/png";
				const ext = mime.includes("svg")
					? "svg"
					: mime.includes("webp")
						? "webp"
						: mime.includes("jpeg") || mime.includes("jpg")
							? "jpg"
							: "png";
				const localPath = `assets/logo.${ext}`;
				zip.file(localPath, blob);
				assetMap.set(url, `./${localPath}`);
			}
		} catch {
			// If fetch fails in test or offline environment, keep URL
		}
	}

	readyFrames.forEach((frame, index) => {
		let clean = extractCleanHtml(frame.htmlCode ?? "");
		for (const [remoteUrl, localPath] of assetMap.entries()) {
			clean = clean.replaceAll(remoteUrl, localPath);
		}
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
