import { z } from "zod";
import {
	type StudioElementContext,
	type StudioElementIdentity,
	studioElementBoundsSchema,
} from "../types/studio-element";

const envelope = {
	channel: z.uuid(),
	projectId: z.string().max(200),
	frameId: z.string().max(200),
	baseRevision: z.int().nonnegative(),
	baseHash: z.string().regex(/^[a-f0-9]{64}$/),
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
]);
export function acceptStudioSelectionMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioElementContext & {
		baseHash: string;
		channel: string;
		source: unknown;
		elements: StudioElementIdentity[];
	},
) {
	if (
		!expected.source ||
		event.source !== expected.source ||
		event.origin !== "null"
	)
		return null;
	const parsed = messageSchema.safeParse(event.data);
	if (!parsed.success) return null;
	const data = parsed.data;
	if (
		data.channel !== expected.channel ||
		data.projectId !== expected.projectId ||
		data.frameId !== expected.frameId ||
		data.baseRevision !== expected.baseRevision ||
		data.baseHash !== expected.baseHash
	)
		return null;
	if (data.type === "studio:element:clear")
		return { type: data.type, target: null };
	const targets = expected.elements.filter(
		(element) => element.elementId === data.elementId,
	);
	if (targets.length !== 1) return null;
	return { type: data.type, target: { ...targets[0], bounds: data.bounds } };
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
let scheduled = false;
const send = (type = 'studio:element:bounds') => {
 scheduled = false;
 if (!selected || !selected.isConnected) return;
 const r = selected.getBoundingClientRect();
 parent.postMessage({...envelope, type, elementId:selected.getAttribute('data-ev-inspect-id'), bounds:{x:r.x,y:r.y,width:r.width,height:r.height}}, origin);
};
const update = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => send()); } };
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
document.fonts.ready.then(update);
document.addEventListener('load', update, true);
})();`;
}
