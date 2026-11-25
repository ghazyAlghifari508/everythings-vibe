import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { studioAssets, studioFrames, studioProjects } from "@/db/schema";
import {
	STUDIO_PROTOTYPE_LIMITS,
	type StudioPrototypeDocument,
} from "../types/studio-prototype";
import { extractCleanHtml } from "../utils/clean-html";
import { studioPrototypeRuntimeScript } from "../utils/studio-prototype-runtime";
import { repairStudioAccessibleLabels } from "./studio-accessible-repair";
import { extractDesignSystemTokens } from "./studio-design-tokens";
import {
	isolateStudioDocument,
	studioIsolationCsp,
} from "./studio-document-isolation";
import { parseStudioElementDocument } from "./studio-element-document";
import { StudioFrameError } from "./studio-frame-errors";
import { extractStudioPrototypeManifest } from "./studio-prototype-manifest";
import { deriveStudioPrototypeScreens } from "./studio-prototype-screens";

const HTML_MAX = 2_000_000;

/**
 * Builds the isolated, interactive document for one frame. Ownership is
 * enforced in the query (`studio_projects.user_id`), the document is rebuilt
 * from the committed HTML on every call (so an edit, revision or deleted
 * element reconciles automatically), and nothing is written: no revision, no
 * job, no credit, no model call.
 */
export async function buildStudioPrototypeDocument(
	input: { projectId: string; frameId: string; channel: string },
	userId: string,
	parentOrigin: string,
): Promise<StudioPrototypeDocument> {
	z.uuid().parse(input.channel);
	const origin = new URL(parentOrigin).origin;
	const [project] = await db
		.select()
		.from(studioProjects)
		.where(
			and(
				eq(studioProjects.id, input.projectId),
				eq(studioProjects.userId, userId),
			),
		)
		.limit(1);
	if (!project) throw new StudioFrameError("STUDIO_NOT_FOUND");
	const frames = await db
		.select()
		.from(studioFrames)
		.where(eq(studioFrames.projectId, project.id))
		.orderBy(asc(studioFrames.order));
	const frame = frames.find((entry) => entry.id === input.frameId);
	if (!frame?.htmlCode || frame.status !== "ready")
		throw new StudioFrameError("STUDIO_NOT_FOUND");
	const clean = extractCleanHtml(frame.htmlCode);
	if (!clean) throw new StudioFrameError("STUDIO_INVALID_INPUT");
	// The canvas and the ZIP export read this same committed document through
	// `finalizeStudioFrameDetail`, which repairs a model-authored search field
	// missing an id/name. The prototype viewer builds its own isolated document,
	// so it must apply the identical repair or the accessibility audit fires on
	// one surface while the canvas is clean.
	const html =
		project.designBlueprint?.compositionOwner === "model"
			? repairStudioAccessibleLabels(clean)
			: clean;
	if (html.length > HTML_MAX) throw new StudioFrameError("STUDIO_INVALID_INPUT");
	const screens = deriveStudioPrototypeScreens(frames, project.designBlueprint);
	if (!screens.some((screen) => screen.id === frame.id))
		throw new StudioFrameError("STUDIO_NOT_FOUND");
	const assets = await db
		.select({
			id: studioAssets.id,
			mimeType: studioAssets.mimeType,
			data: studioAssets.data,
		})
		.from(studioAssets)
		.where(
			and(
				eq(studioAssets.projectId, project.id),
				eq(studioAssets.userId, userId),
			),
		);
	const dom = parseStudioElementDocument(html);
	try {
		const { document } = dom.window;
		// Manifest first: it reads declarations that isolation would otherwise
		// strip, and it stamps the validated `data-ev-ix` markers.
		const manifest = extractStudioPrototypeManifest(document, {
			screens,
			blueprint: project.designBlueprint,
		});
		const { unresolvedAssets, unrenderedIcons } = await isolateStudioDocument(
			document,
			{
				origin,
				assets,
				tokens: extractDesignSystemTokens(project.designMd),
				anchors: "strip",
			},
		);
		const hiddenStyle = document.createElement("style");
		// The runtime toggles [hidden]; author display rules must not override it.
		hiddenStyle.textContent = "[hidden]{display:none!important}";
		document.head.append(hiddenStyle);
		const csp = document.createElement("meta");
		csp.httpEquiv = "Content-Security-Policy";
		csp.content = studioIsolationCsp(input.channel);
		document.head.prepend(csp);
		const runtime = document.createElement("script");
		runtime.setAttribute("nonce", input.channel);
		runtime.textContent = studioPrototypeRuntimeScript({
			channel: input.channel,
			screenId: frame.id,
			origin,
			interactions: manifest.interactions,
		});
		document.body.append(runtime);
		const output = `<!doctype html>${document.documentElement.outerHTML}`;
		if (output.length > HTML_MAX)
			throw new StudioFrameError("STUDIO_INVALID_INPUT");
		return {
			html: output,
			projectId: project.id,
			frameId: frame.id,
			baseRevision: frame.revision,
			channel: input.channel,
			screens: screens.slice(0, STUDIO_PROTOTYPE_LIMITS.screens),
			interactionCount: Object.keys(manifest.interactions).length,
			legacyMapped: manifest.legacyMapped,
			issues: manifest.issues,
			unresolvedAssets,
			unrenderedIcons,
			defaults: manifest.defaults,
			inertLinks: manifest.inertLinks,
		};
	} finally {
		dom.window.close();
	}
}
