import { z } from "zod";
import {
	type StudioElementContext,
	type StudioElementIdentity,
	studioElementBoundsSchema,
} from "../types/studio-element";
import {
	STUDIO_RENDERER_MESSAGE_TYPES,
	type StudioRendererMetrics,
	studioRendererMetricsSchema,
} from "../types/studio-renderer";
import { studioInlineTextScript } from "./studio-inline-text-script";

const envelope = {
	channel: z.uuid(),
	projectId: z.string().max(200),
	frameId: z.string().max(200),
	baseRevision: z.int().nonnegative(),
	baseHash: z.string().regex(/^[a-f0-9]{64}$/),
};
const textSession = {
	...envelope,
	elementId: z.string().min(1).max(200),
	session: z.uuid(),
};
const messageSchema = z.discriminatedUnion("type", [
	z.strictObject({
		...envelope,
		type: z.literal("studio:element:select"),
		elementId: z.string().min(1).max(200),
		bounds: studioElementBoundsSchema,
	}),
	z.strictObject({
		...envelope,
		type: z.literal("studio:element:bounds"),
		elementId: z.string().min(1).max(200),
		bounds: studioElementBoundsSchema,
	}),
	z.strictObject({ ...envelope, type: z.literal("studio:element:clear") }),
	z.strictObject({
		...envelope,
		type: z.literal("studio:element:hover"),
		elementId: z.string().min(1).max(200),
		bounds: studioElementBoundsSchema,
	}),
	z.strictObject({
		...envelope,
		type: z.literal("studio:element:hover-clear"),
	}),
	z.strictObject({
		...textSession,
		type: z.literal("studio:element:text-started"),
	}),
	z.strictObject({
		...textSession,
		type: z.literal("studio:element:text-end"),
		reason: z.enum(["closed", "too-long", "unavailable"]),
	}),
	z.strictObject({
		...textSession,
		type: z.literal("studio:element:text-commit"),
		text: z.string().max(8000),
	}),
]);
const rendererMessageSchema = z.discriminatedUnion("type", [
	z.strictObject({
		...envelope,
		type: z.literal(STUDIO_RENDERER_MESSAGE_TYPES.ready),
		...studioRendererMetricsSchema.shape,
		unresolvedImages: z.int().nonnegative().max(10_000),
	}),
	z.strictObject({
		...envelope,
		type: z.literal(STUDIO_RENDERER_MESSAGE_TYPES.metrics),
		...studioRendererMetricsSchema.shape,
	}),
]);
type StudioBridgeExpectation = StudioElementContext & {
	baseHash: string;
	channel: string;
	source: unknown;
};
/**
 * A sandboxed document has the opaque origin "null", so origin alone proves
 * nothing. The sender window, the per-document channel and the full frame
 * identity must all match before any payload is interpreted.
 */
function trustedSender(
	event: { source: unknown; origin: string },
	expected: { source: unknown },
) {
	return (
		Boolean(expected.source) &&
		event.source === expected.source &&
		event.origin === "null"
	);
}
function sameDocument(
	data: StudioElementContext & { baseHash: string; channel: string },
	expected: StudioBridgeExpectation,
) {
	return (
		data.channel === expected.channel &&
		data.projectId === expected.projectId &&
		data.frameId === expected.frameId &&
		data.baseRevision === expected.baseRevision &&
		data.baseHash === expected.baseHash
	);
}
export function acceptStudioRendererMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioBridgeExpectation,
): {
	type: "ready" | "metrics";
	metrics: StudioRendererMetrics;
	unresolvedImages: number;
} | null {
	if (!trustedSender(event, expected)) return null;
	const parsed = rendererMessageSchema.safeParse(event.data);
	if (!parsed.success || !sameDocument(parsed.data, expected)) return null;
	const { scrollWidth, scrollHeight } = parsed.data;
	return {
		type:
			parsed.data.type === STUDIO_RENDERER_MESSAGE_TYPES.ready
				? "ready"
				: "metrics",
		metrics: { scrollWidth, scrollHeight },
		unresolvedImages:
			parsed.data.type === STUDIO_RENDERER_MESSAGE_TYPES.ready
				? parsed.data.unresolvedImages
				: 0,
	};
}
export function acceptStudioSelectionMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioBridgeExpectation & { elements: StudioElementIdentity[] },
) {
	if (!trustedSender(event, expected)) return null;
	const parsed = messageSchema.safeParse(event.data);
	if (!parsed.success) return null;
	const data = parsed.data;
	if (!sameDocument(data, expected)) return null;
	if (data.type === "studio:element:clear")
		return { type: data.type, target: null };
	if (
		data.type !== "studio:element:select" &&
		data.type !== "studio:element:bounds"
	)
		return null;
	const targets = expected.elements.filter(
		(element) => element.elementId === data.elementId,
	);
	if (targets.length !== 1) return null;
	return { type: data.type, target: { ...targets[0], bounds: data.bounds } };
}

export type StudioHoverMessage =
	| {
			type: "hover";
			elementId: string;
			bounds: z.infer<typeof studioElementBoundsSchema>;
	  }
	| { type: "hover-clear" };

/** Hover never changes selection; the parent resolves policy from identity. */
export function acceptStudioHoverMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioBridgeExpectation & {
		elements: readonly StudioElementIdentity[];
	},
): StudioHoverMessage | null {
	if (!trustedSender(event, expected)) return null;
	const parsed = messageSchema.safeParse(event.data);
	if (!parsed.success || !sameDocument(parsed.data, expected)) return null;
	const data = parsed.data;
	if (data.type === "studio:element:hover-clear")
		return { type: "hover-clear" };
	if (data.type !== "studio:element:hover") return null;
	if (!expected.elements.some((item) => item.elementId === data.elementId))
		return null;
	return { type: "hover", elementId: data.elementId, bounds: data.bounds };
}

export function acceptStudioTextMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioBridgeExpectation & { elementId: string; session: string },
) {
	if (!trustedSender(event, expected)) return null;
	const parsed = messageSchema.safeParse(event.data);
	if (!parsed.success || !sameDocument(parsed.data, expected)) return null;
	const data = parsed.data;
	if (
		data.type !== "studio:element:text-started" &&
		data.type !== "studio:element:text-end" &&
		data.type !== "studio:element:text-commit"
	)
		return null;
	return data.elementId === expected.elementId &&
		data.session === expected.session
		? data
		: null;
}

export function studioSelectionBridgeScript(
	envelope: StudioElementContext & { baseHash: string; channel: string },
	parentOrigin: string,
) {
	// Only this nonce-authorized script runs. Parent commands are tied to this document.
	return `(() => {
const envelope = ${JSON.stringify(envelope).replaceAll("<", "\\u003c")};
const origin = ${JSON.stringify(parentOrigin)};
const inspectAttr = 'data-ev-inspect-id';
const ignored = '[hidden], [inert], [aria-hidden="true" i], [data-ev-editor-overlay], [data-ev-feedback], [data-ev-error]';
const post = (type, details = {}) => parent.postMessage({...envelope, type, ...details}, origin);
let selected = null;
let hoverPoint = null;
let lastHover = '';
let scheduled = false;
let hoverScheduled = false;
let lastSelection = '';
const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
const isVisible = node => {
 if (!node?.isConnected || node.closest(ignored) || !node.getClientRects().length) return false;
 if (node.checkVisibility && !node.checkVisibility({opacityProperty:true, visibilityProperty:true, contentVisibilityAuto:true})) return false;
 const style = getComputedStyle(node);
 if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
 for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
  if (getComputedStyle(ancestor).opacity === '0') return false;
 }
 const r = rect(node);
 return r.width > 0 && r.height > 0;
};
const resolve = node => {
 if (!(node instanceof Element) || node.closest(ignored)) return null;
 const candidate = node.closest('[' + inspectAttr + ']');
 return isVisible(candidate) ? candidate : null;
};
const sendSelection = (type = 'studio:element:bounds') => {
 if (isVisible(selected)) {
  const region = {elementId:selected.getAttribute(inspectAttr), bounds:rect(selected)};
  const key = JSON.stringify(region);
  if (type !== 'studio:element:bounds' || key !== lastSelection) post(type, region);
  lastSelection = key;
 } else if (selected) { selected = null; lastSelection = ''; post('studio:element:clear'); }
};
const clearHover = () => {
 if (!lastHover) return;
 lastHover = '';
 post('studio:element:hover-clear');
};
const sendHover = () => {
 const node = !editing && hoverPoint ? resolve(document.elementFromPoint(...hoverPoint)) : null;
 if (!node) { clearHover(); return; }
 const region = {elementId:node.getAttribute(inspectAttr), bounds:rect(node)};
 const key = JSON.stringify(region);
 if (lastHover === key) return;
 lastHover = key;
 post('studio:element:hover', region);
};
const update = () => {
 if (scheduled) return;
 scheduled = true;
 requestAnimationFrame(() => { scheduled = false; sendSelection(); metrics(); sendHover(); });
};
${studioInlineTextScript}
const measure = () => ({
 scrollWidth: Math.ceil(document.documentElement.scrollWidth),
 scrollHeight: Math.ceil(Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().bottom + window.scrollY)),
});
let lastMetrics = '';
document.addEventListener('beforeinput', event => {
 if (!editing?.host.contains(event.target)) event.preventDefault();
}, true);
const metrics = () => {
 if (editing) return;
 const m = measure();
 const key = m.scrollWidth + 'x' + m.scrollHeight;
 if (key === lastMetrics) return;
 lastMetrics = key;
 parent.postMessage({...envelope, type:'${STUDIO_RENDERER_MESSAGE_TYPES.metrics}', ...m}, origin);
};
void Promise.all([
 document.fonts.ready,
 ...Array.from(document.images, image => image.complete || image.loading === 'lazy' ? null : new Promise(done => { image.addEventListener('load', done, {once:true}); image.addEventListener('error', done, {once:true}); })),
]).then(() => {
 if (!document?.body) return;
 const unresolvedImages = Array.from(document.images).filter(image => image.complete && image.naturalWidth === 0 && image.getAttribute('src')).length;
 const m = measure();
 lastMetrics = m.scrollWidth + 'x' + m.scrollHeight;
 post('${STUDIO_RENDERER_MESSAGE_TYPES.ready}', {...m, unresolvedImages});
 update();
});
document.addEventListener('pointermove', event => {
 hoverPoint = [event.clientX, event.clientY];
 if (!hoverScheduled) {
  hoverScheduled = true;
  requestAnimationFrame(() => { hoverScheduled = false; sendHover(); });
 }
}, true);
document.documentElement.addEventListener('pointerleave', () => { hoverPoint = null; clearHover(); });
document.addEventListener('click', event => {
 if (editing?.host.contains(event.target)) return;
 event.preventDefault(); event.stopImmediatePropagation();
 selected = resolve(event.target);
 if (selected) sendSelection('studio:element:select');
 else post('studio:element:clear');
}, true);
document.addEventListener('submit', event => event.preventDefault(), true);
document.addEventListener('keydown', event => {
 if (textKey(event)) return;
 if (event.key === 'Escape') { selected = null; post('studio:element:clear'); }
 if (event.key === 'Enter' || event.key === ' ') {
  const target = resolve(event.target);
  if (target && target === event.target) {
   event.preventDefault(); selected = target; sendSelection('studio:element:select');
  }
 }
}, true);
document.addEventListener('scroll', update, true);
window.addEventListener('resize', update);
new ResizeObserver(update).observe(document.body);
document.addEventListener('load', update, true);
})();`;
}
