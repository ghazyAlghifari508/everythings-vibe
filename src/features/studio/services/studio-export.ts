import JSZip from "jszip";
import type { StudioFrameRow } from "@/db/schema";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";

export function sanitizeFilename(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 50) || "screen"
	);
}

/** Local Studio assets are relative to the app origin and must be bundled. */
const INTERNAL_ASSET_URL = /\/api\/studio\/asset\?[^"'\s<>]+/g;
const INTERNAL_ASSET_REMAINS = /\/api\/studio\/asset\?/;
/** Any remaining absolute URL is a documented online dependency, not bundled. */
const EXTERNAL_URL = /https?:\/\/([^/"'\s<>)+]+)/g;
const NOT_A_DEPENDENCY = /^(?:www\.)?w3\.org$/i;

/**
 * Reads the frame's final document from the server.
 *
 * The ZIP used to ship whatever bytes were persisted, which let an already
 * generated screen keep an old canonical stylesheet forever. The server owns the
 * one final-document transformation, so preview and export cannot disagree. A
 * missing answer falls back to the persisted HTML instead of failing the export.
 */
async function readFinalHtml(
	projectId: string,
	frameId: string,
): Promise<string | null> {
	try {
		const response = await fetch(
			`/api/studio/frame?projectId=${encodeURIComponent(projectId)}&frameId=${encodeURIComponent(frameId)}&document=1`,
		);
		if (!response.ok) return null;
		const body: unknown = await response.json();
		if (
			typeof body === "object" &&
			body !== null &&
			"html" in body &&
			typeof body.html === "string"
		)
			return body.html;
		return null;
	} catch {
		return null;
	}
}

/**
 * Points bundled assets at their ZIP-relative paths.
 *
 * An internal URL that survives bundling would be a login-only reference in a
 * standalone file, so it fails the export instead of shipping a broken asset.
 */
export function rewriteBundledAssets(
	html: string,
	assetMap: Map<string, string>,
): string {
	let clean = html;
	for (const [remoteUrl, localPath] of assetMap.entries())
		clean = clean.replaceAll(remoteUrl, localPath);
	if (INTERNAL_ASSET_REMAINS.test(clean))
		throw new Error("Aset project tidak dapat dibundel ke dalam ZIP.");
	return clean;
}

/** External origins a standalone export still needs a connection for. */
export function listExternalDependencies(html: string): string[] {
	const origins = new Set<string>();
	for (const match of html.matchAll(EXTERNAL_URL)) {
		const origin = match[1] ?? "";
		if (!origin || NOT_A_DEPENDENCY.test(origin)) continue;
		origins.add(origin);
	}
	return [...origins].sort();
}

async function bundleAssets(
	zip: JSZip,
	htmls: string[],
): Promise<Map<string, string>> {
	const assetMap = new Map<string, string>();
	const foundUrls = new Set<string>();
	for (const html of htmls)
		for (const url of html.match(INTERNAL_ASSET_URL) ?? []) foundUrls.add(url);

	for (const url of foundUrls) {
		let blob: Blob;
		try {
			const res = await fetch(url.replaceAll("&amp;", "&"));
			if (!res.ok) throw new Error("Aset project tidak dapat diunduh.");
			blob = await res.blob();
		} catch {
			throw new Error("Gagal menyertakan aset project. Coba unduh kembali.");
		}
		const mime = blob.type || "image/png";
		const ext = mime.includes("svg")
			? "svg"
			: mime.includes("webp")
				? "webp"
				: mime.includes("jpeg") || mime.includes("jpg")
					? "jpg"
					: "png";
		const localPath = `assets/asset-${assetMap.size + 1}.${ext}`;
		zip.file(localPath, blob);
		assetMap.set(url, `./${localPath}`);
	}
	return assetMap;
}

export async function exportProjectAsZip(
	projectTitle: string,
	projectId: string,
	frames: StudioFrameRow[],
): Promise<void> {
	const zip = new JSZip();
	const readyFrames = frames.filter((f) => f.status === "ready" && f.htmlCode);

	if (readyFrames.length === 0)
		throw new Error("Belum ada layar selesai untuk diekspor.");

	const htmls = await Promise.all(
		readyFrames.map(
			async (frame) =>
				(await readFinalHtml(projectId, frame.id)) ??
				extractCleanHtml(frame.htmlCode ?? ""),
		),
	);

	const assetMap = await bundleAssets(zip, htmls);

	const files: string[] = [];
	const shipped = htmls.map((html, index) => {
		const clean = rewriteBundledAssets(html, assetMap);
		const frame = readyFrames[index];
		const filename = `${index + 1}-${sanitizeFilename(frame?.name ?? "screen")}.html`;
		zip.file(filename, clean);
		if (index === 0) zip.file("index.html", clean);
		files.push(filename);
		return clean;
	});

	const external = [
		...new Set(shipped.flatMap((html) => listExternalDependencies(html))),
	].sort();
	const manifest = {
		title: projectTitle,
		exportedAt: new Date().toISOString(),
		// Bundled local assets travel with the ZIP; anything else is an online
		// dependency the reader must have network access for.
		offlineReady: external.length === 0,
		externalDependencies: external,
		screens: readyFrames.map((f, i) => ({
			order: i + 1,
			name: f.name,
			viewport: f.viewport,
			file: files[i],
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
