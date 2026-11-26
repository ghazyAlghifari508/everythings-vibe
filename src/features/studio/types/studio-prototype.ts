import { z } from "zod";
import { STUDIO_DEVICES, type StudioDevice } from "./studio-renderer";

/**
 * P10 prototype contract. Generated HTML stays static and untrusted: it only
 * carries inert `data-ev-*` declarations. The server validates them into a
 * manifest, the trusted runtime executes manifest entries only, and the parent
 * owns navigation and session state. Nothing here is ever persisted into a
 * frame's HTML or a design revision.
 */
export const STUDIO_PROTOTYPE_ACTIONS = [
	"navigate",
	"back",
	"open_dialog",
	"close_dialog",
	"select_tab",
	"expand",
	"collapse",
	"toggle",
	"set_mock_state",
	"filter_collection",
	"validate_form",
	"submit_mock_form",
	"show_feedback",
] as const;
export type StudioPrototypeActionType =
	(typeof STUDIO_PROTOTYPE_ACTIONS)[number];

export const STUDIO_PROTOTYPE_LIMITS = {
	screens: 24,
	interactions: 200,
	stateKeys: 40,
	stateValueChars: 200,
	stateTotalChars: 4000,
	messageChars: 160,
	history: 50,
	simulateMs: 1500,
	issues: 50,
} as const;

/** Presentation viewports. Desktop height is the browser content area of the shell. */
export const STUDIO_PROTOTYPE_VIEWPORTS: Record<
	StudioDevice,
	{ width: number; height: number }
> = {
	desktop: { width: 1440, height: 840 },
	tablet: { width: 768, height: 1024 },
	mobile: { width: 390, height: 844 },
};

const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const studioPrototypeStateKeySchema = identifier;
export const studioPrototypeStateValueSchema = z.union([
	z.string().max(STUDIO_PROTOTYPE_LIMITS.stateValueChars),
	z.number().finite(),
	z.boolean(),
]);
export type StudioPrototypeStateValue = z.infer<
	typeof studioPrototypeStateValueSchema
>;
export const studioPrototypeStateSchema = z
	.record(studioPrototypeStateKeySchema, studioPrototypeStateValueSchema)
	.refine(
		(state) =>
			Object.keys(state).length <= STUDIO_PROTOTYPE_LIMITS.stateKeys &&
			JSON.stringify(state).length <= STUDIO_PROTOTYPE_LIMITS.stateTotalChars,
		"Mock state exceeds its bounds.",
	);
export type StudioPrototypeState = z.infer<typeof studioPrototypeStateSchema>;

export const studioPrototypeScreenSchema = z.strictObject({
	/** Stable identity: the frame id. Display names may change, ids do not. */
	id: z.string().min(1).max(200),
	name: z.string().min(1).max(100),
	route: z.string().regex(/^\/[a-z0-9-]{1,60}$/),
	destinationId: z.string().max(100).nullable(),
	order: z.int().nonnegative(),
});
export type StudioPrototypeScreen = z.infer<typeof studioPrototypeScreenSchema>;

const target = z.strictObject({
	/** Resolved screen id; `null` when the requested page does not exist. */
	screenId: z.string().min(1).max(200).nullable(),
	requested: z.string().max(120),
});
const name = identifier;
const base = { ix: z.string().regex(/^ix-\d{1,4}$/) };

export const studioPrototypeInteractionSchema = z.discriminatedUnion("type", [
	z.strictObject({ ...base, type: z.literal("navigate"), ...target.shape }),
	z.strictObject({ ...base, type: z.literal("back") }),
	z.strictObject({ ...base, type: z.literal("open_dialog"), dialog: name }),
	z.strictObject({
		...base,
		type: z.literal("close_dialog"),
		dialog: name.nullable(),
	}),
	z.strictObject({
		...base,
		type: z.literal("select_tab"),
		group: name,
		tab: name,
	}),
	z.strictObject({ ...base, type: z.literal("expand"), target: name }),
	z.strictObject({ ...base, type: z.literal("collapse"), target: name }),
	z.strictObject({ ...base, type: z.literal("toggle"), target: name }),
	z.strictObject({
		...base,
		type: z.literal("set_mock_state"),
		key: studioPrototypeStateKeySchema,
		value: studioPrototypeStateValueSchema,
	}),
	z.strictObject({
		...base,
		type: z.literal("filter_collection"),
		collection: name,
		mode: z.enum(["search", "tag"]),
		/** Tag filter value; an empty string clears the tag filter. */
		tag: z.string().max(60).optional(),
	}),
	z.strictObject({ ...base, type: z.literal("validate_form"), form: name }),
	z.strictObject({
		...base,
		type: z.literal("submit_mock_form"),
		form: name,
		success: target.optional(),
		feedback: z.string().max(STUDIO_PROTOTYPE_LIMITS.messageChars).optional(),
		stateOnSuccess: z
			.strictObject({
				key: studioPrototypeStateKeySchema,
				value: studioPrototypeStateValueSchema,
			})
			.optional(),
		requiredState: z.array(studioPrototypeStateKeySchema).max(10).optional(),
		closeDialog: z.boolean().optional(),
		simulateMs: z
			.int()
			.min(0)
			.max(STUDIO_PROTOTYPE_LIMITS.simulateMs)
			.optional(),
	}),
	z.strictObject({
		...base,
		type: z.literal("show_feedback"),
		message: z.string().min(1).max(STUDIO_PROTOTYPE_LIMITS.messageChars),
		tone: z.enum(["info", "success", "danger"]),
	}),
]);
export type StudioPrototypeInteraction = z.infer<
	typeof studioPrototypeInteractionSchema
>;

export const studioPrototypeIssueSchema = z.strictObject({
	code: z.enum([
		"UNKNOWN_ACTION",
		"INVALID_PARAMETER",
		"MISSING_TARGET_ELEMENT",
		"UNKNOWN_SCREEN",
		"TOO_MANY_INTERACTIONS",
		"SENSITIVE_FIELD",
	]),
	message: z.string().max(240),
});
export type StudioPrototypeIssue = z.infer<typeof studioPrototypeIssueSchema>;

/** Response of the isolated prototype document endpoint. */
export const studioPrototypeDocumentSchema = z.strictObject({
	html: z.string().max(2_000_000),
	projectId: z.string(),
	frameId: z.string(),
	baseRevision: z.int().nonnegative(),
	channel: z.uuid(),
	screens: z
		.array(studioPrototypeScreenSchema)
		.max(STUDIO_PROTOTYPE_LIMITS.screens),
	interactionCount: z.int().nonnegative(),
	/** Interactions derived from canonical navigation instead of declarations. */
	legacyMapped: z.int().nonnegative(),
	issues: z
		.array(studioPrototypeIssueSchema)
		.max(STUDIO_PROTOTYPE_LIMITS.issues),
	unresolvedAssets: z.int().nonnegative(),
	unrenderedIcons: z.int().nonnegative(),
	/** Documented initial mock state; the session resets to exactly this. */
	defaults: studioPrototypeStateSchema,
	/** Anchors with no destination, shown honestly as not connected. */
	inertLinks: z.int().nonnegative(),
});
export type StudioPrototypeDocument = z.infer<
	typeof studioPrototypeDocumentSchema
>;

/** Messages the trusted runtime posts to the parent. */
const envelope = {
	channel: z.uuid(),
	screenId: z.string().min(1).max(200),
};
export const studioPrototypeMessageSchema = z.discriminatedUnion("type", [
	z.strictObject({ ...envelope, type: z.literal("proto:ready") }),
	z.strictObject({
		...envelope,
		type: z.literal("proto:navigate"),
		target: target,
	}),
	z.strictObject({ ...envelope, type: z.literal("proto:back") }),
	z.strictObject({
		...envelope,
		type: z.literal("proto:state"),
		state: studioPrototypeStateSchema,
	}),
]);
export type StudioPrototypeMessage = z.infer<
	typeof studioPrototypeMessageSchema
>;

/** The only parent-to-document command: initial mock state for this document. */
export const studioPrototypeInitSchema = z.strictObject({
	type: z.literal("proto:init"),
	channel: z.uuid(),
	state: studioPrototypeStateSchema,
});

/** Viewer search state: validated, and never trusted to name another project. */
export const studioPrototypeSearchSchema = z.object({
	frameId: z.string().min(1).max(200).optional(),
	device: z.enum(STUDIO_DEVICES).optional(),
	returnTo: z.string().max(300).optional(),
});
export type StudioPrototypeSearch = z.infer<typeof studioPrototypeSearchSchema>;

/** Lean, ownership-checked data the viewer shell needs before any document loads. */
export interface StudioPrototypeLoaderData {
	projectId: string;
	title: string;
	screens: StudioPrototypeScreen[];
	/** Native viewport per screen id ("web" or "mobile"). */
	viewports: Record<string, string>;
}
