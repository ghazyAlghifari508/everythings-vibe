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

const envelope = {
	channel: z.uuid(),
	projectId: z.string().max(200),
	frameId: z.string().max(200),
	baseRevision: z.int().nonnegative(),
	baseHash: z.string().regex(/^[a-f0-9]{64}$/),
};
const regionSchema = z.strictObject({
	elementId: z.string().min(1).max(200),
	bounds: studioElementBoundsSchema,
});
/** Bounded once-per-ready snapshot used only by the pencil activation reveal. */
export const STUDIO_ELEMENT_INVENTORY_MAX = 48;
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
		...envelope,
		type: z.literal("studio:element:inventory"),
		regions: z.array(regionSchema).max(STUDIO_ELEMENT_INVENTORY_MAX),
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

/** Once-per-ready, bounded overlay inventory for the pencil activation reveal. */
export function acceptStudioInventoryMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioBridgeExpectation & {
		elements: readonly StudioElementIdentity[];
	},
) {
	if (!trustedSender(event, expected)) return null;
	const parsed = messageSchema.safeParse(event.data);
	if (!parsed.success || !sameDocument(parsed.data, expected)) return null;
	const data = parsed.data;
	if (data.type !== "studio:element:inventory") return null;
	const known = new Set(expected.elements.map((item) => item.elementId));
	return {
		regions: data.regions.filter((region) => known.has(region.elementId)),
	};
}

export function studioSelectionBridgeScript(
	envelope: StudioElementContext & { baseHash: string; channel: string },
	parentOrigin: string,
) {
	// Only this trusted script executes; no parent-to-child command channel exists.
	return `(() => {
const envelope = ${JSON.stringify(envelope).replaceAll("<", "\\u003c")};
const origin = ${JSON.stringify(parentOrigin)};
let selected = null;
let hovering = null;
let scheduled = false;
let hoverScheduled = false;
const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
const send = (type = 'studio:element:bounds') => {
 scheduled = false;
 if (!selected || !selected.isConnected) return;
 parent.postMessage({...envelope, type, elementId:selected.getAttribute('data-ev-inspect-id'), bounds:rect(selected)}, origin);
};
const sendHover = () => {
 hoverScheduled = false;
 if (!hovering || !hovering.isConnected) return;
 parent.postMessage({...envelope, type:'studio:element:hover', elementId:hovering.getAttribute('data-ev-inspect-id'), bounds:rect(hovering)}, origin);
};
const scheduleHover = () => { if (!hoverScheduled) { hoverScheduled = true; requestAnimationFrame(sendHover); } };
const clearHover = () => { hovering = null; parent.postMessage({...envelope, type:'studio:element:hover-clear'}, origin); };
const update = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { send(); metrics(); if (hovering) sendHover(); }); } };
const measure = () => ({
 scrollWidth: Math.ceil(document.documentElement.scrollWidth),
 scrollHeight: Math.ceil(Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().bottom + window.scrollY)),
});
let lastMetrics = '';
const metrics = () => {
 const m = measure();
 const key = m.scrollWidth + 'x' + m.scrollHeight;
 if (key === lastMetrics) return;
 lastMetrics = key;
 parent.postMessage({...envelope, type:'${STUDIO_RENDERER_MESSAGE_TYPES.metrics}', ...m}, origin);
};
const settled = Promise.all([
 document.fonts.ready,
 ...Array.from(document.images, image => image.complete ? null : new Promise(done => { image.addEventListener('load', done, {once:true}); image.addEventListener('error', done, {once:true}); })),
]).then(() => {
 const unresolvedImages = Array.from(document.images).filter(image => image.complete && image.naturalWidth === 0 && image.getAttribute('src')).length;
 const m = measure();
 lastMetrics = m.scrollWidth + 'x' + m.scrollHeight;
 parent.postMessage({...envelope, type:'${STUDIO_RENDERER_MESSAGE_TYPES.ready}', ...m, unresolvedImages}, origin);
 const regions = Array.from(document.querySelectorAll('[data-ev-inspect-id]')).filter(node => {
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
 }).slice(0, ${STUDIO_ELEMENT_INVENTORY_MAX}).map(node => ({elementId:node.getAttribute('data-ev-inspect-id'), bounds:rect(node)}));
 if (regions.length) parent.postMessage({...envelope, type:'studio:element:inventory', regions}, origin);
 update();
});
document.addEventListener('pointermove', event => {
 const target = event.target instanceof Element ? event.target.closest('[data-ev-inspect-id]') : null;
 if (target === hovering) { scheduleHover(); return; }
 if (target) hovering = target;
 else clearHover();
}, true);
document.documentElement.addEventListener('pointerleave', clearHover);
document.addEventListener('click', event => {
 event.preventDefault(); event.stopImmediatePropagation();
 const target = event.target instanceof Element ? event.target.closest('[data-ev-inspect-id]') : null;
 if (target) { selected = target; send('studio:element:select'); }
}, true);
document.addEventListener('submit', event => event.preventDefault(), true);
document.addEventListener('keydown', event => {
 if (event.key === 'Escape') { selected = null; parent.postMessage({...envelope,type:'studio:element:clear'}, origin); }
 if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.hasAttribute('data-ev-inspect-id')) {
  event.preventDefault(); selected = event.target; send('studio:element:select');
 }
}, true);
document.addEventListener('scroll', update, true);
window.addEventListener('resize', update);
new ResizeObserver(update).observe(document.body);
document.addEventListener('load', update, true);
void settled;
})();`;
}
