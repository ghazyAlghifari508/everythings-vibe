import {
	STUDIO_PROTOTYPE_ACTIONS,
	STUDIO_PROTOTYPE_LIMITS,
	type StudioPrototypeInteraction,
	type StudioPrototypeIssue,
	type StudioPrototypeScreen,
	type StudioPrototypeState,
	studioPrototypeInteractionSchema,
	studioPrototypeStateKeySchema,
	studioPrototypeStateSchema,
	studioPrototypeStateValueSchema,
} from "../types/studio-prototype";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import { resolveStudioPrototypeTarget } from "./studio-prototype-screens";

/**
 * Declarative attributes generated HTML may carry. They are inert text: only
 * this module reads them, and only a validated manifest ever reaches the
 * trusted runtime. The prefix differs from `data-ev-*` on purpose, which is
 * reserved for Studio's own injected markers and rejected in AI replacements.
 */
const ATTR = {
	action: "data-proto-action",
	target: "data-proto-target",
	tabGroup: "data-proto-tab-group",
	tab: "data-proto-tab",
	tabPanel: "data-proto-tab-panel",
	stateKey: "data-proto-state-key",
	stateValue: "data-proto-state-value",
	tag: "data-proto-tag",
	success: "data-proto-success",
	feedback: "data-proto-feedback",
	successKey: "data-proto-success-key",
	successValue: "data-proto-success-value",
	requiredState: "data-proto-required-state",
	closeDialog: "data-proto-close-dialog",
	simulate: "data-proto-simulate-ms",
	message: "data-proto-message",
	tone: "data-proto-tone",
	dialog: "data-proto-dialog",
	region: "data-proto-region",
	form: "data-proto-form",
	collection: "data-proto-collection",
	defaultKey: "data-proto-default-key",
	defaultValue: "data-proto-default-value",
} as const;

export const STUDIO_PROTOTYPE_IX_ATTR = "data-ev-ix";
export const STUDIO_PROTOTYPE_SENSITIVE_ATTR = "data-ev-sensitive";

const SENSITIVE_FIELD =
	/(?:password|passwd|kata-?sandi|card|kartu|cvv|cvc|otp|\bpin\b|account-?number|rekening|iban|\bssn\b|\bnik\b)/i;
const NATIVE_INTERACTIVE = /^(?:a|button|input|select|textarea|summary)$/;

export interface StudioPrototypeManifestResult {
	interactions: Record<string, StudioPrototypeInteraction>;
	/** Documented initial mock state declared by the screen. */
	defaults: StudioPrototypeState;
	issues: StudioPrototypeIssue[];
	legacyMapped: number;
	/** Anchors with no destination (`href="#"`): shown honestly as inert. */
	inertLinks: number;
}

interface Context {
	screens: readonly StudioPrototypeScreen[];
	blueprint?: StudioDesignBlueprint | null;
}

function attr(element: Element, name: string): string | null {
	const value = element.getAttribute(name);
	return value === null ? null : value.trim();
}

function exists(document: Document, name: string, value: string): boolean {
	return [...document.querySelectorAll(`[${name}]`)].some(
		(node) => node.getAttribute(name) === value,
	);
}

function tabPanelExists(document: Document, group: string, tab: string) {
	return [...document.querySelectorAll(`[${ATTR.tabPanel}]`)].some(
		(node) =>
			node.getAttribute(ATTR.tabPanel) === tab &&
			node.getAttribute(ATTR.tabGroup) === group,
	);
}

function stateValue(raw: string | null) {
	return raw ?? "";
}

/** Raw, still-unvalidated parameters for one declared action. */
function candidate(
	element: Element,
	type: string,
	context: Context,
): Record<string, unknown> {
	const target = attr(element, ATTR.target) ?? "";
	const tone = attr(element, ATTR.tone);
	switch (type) {
		case "navigate":
			return resolveStudioPrototypeTarget(
				target,
				context.screens,
				context.blueprint,
			);
		case "open_dialog":
			return { dialog: target };
		case "close_dialog":
			return { dialog: target || null };
		case "select_tab":
			return {
				group: attr(element, ATTR.tabGroup) ?? "",
				tab: attr(element, ATTR.tab) ?? "",
			};
		case "expand":
		case "collapse":
		case "toggle":
			return { target };
		case "set_mock_state":
			return {
				key: attr(element, ATTR.stateKey) ?? "",
				value: stateValue(attr(element, ATTR.stateValue)),
			};
		case "filter_collection": {
			const search = /^(?:input|textarea)$/.test(element.localName);
			return {
				collection: target,
				mode: search ? "search" : "tag",
				...(search ? {} : { tag: attr(element, ATTR.tag) ?? "" }),
			};
		}
		case "validate_form":
			return { form: target };
		case "submit_mock_form": {
			const success = attr(element, ATTR.success);
			const feedback = attr(element, ATTR.feedback);
			const key = attr(element, ATTR.successKey);
			const required = attr(element, ATTR.requiredState);
			const simulate = attr(element, ATTR.simulate);
			return {
				form: target,
				...(success
					? {
							success: resolveStudioPrototypeTarget(
								success,
								context.screens,
								context.blueprint,
							),
						}
					: {}),
				...(feedback ? { feedback } : {}),
				...(key
					? {
							stateOnSuccess: {
								key,
								value: stateValue(attr(element, ATTR.successValue)),
							},
						}
					: {}),
				...(required ? { requiredState: required.split(/\s+/) } : {}),
				...(attr(element, ATTR.closeDialog) === "true"
					? { closeDialog: true }
					: {}),
				...(simulate && /^\d{1,4}$/.test(simulate)
					? { simulateMs: Number(simulate) }
					: {}),
			};
		}
		case "show_feedback":
			return {
				message: attr(element, ATTR.message) ?? "",
				tone: tone ?? "info",
			};
		default:
			return {};
	}
}

/** The element a validated interaction depends on, or `null` when it needs none. */
function missingTarget(
	document: Document,
	interaction: StudioPrototypeInteraction,
): string | null {
	switch (interaction.type) {
		case "open_dialog":
			return exists(document, ATTR.dialog, interaction.dialog)
				? null
				: `Dialog "${interaction.dialog}" tidak ada di layar ini.`;
		case "close_dialog":
			return interaction.dialog &&
				!exists(document, ATTR.dialog, interaction.dialog)
				? `Dialog "${interaction.dialog}" tidak ada di layar ini.`
				: null;
		case "select_tab":
			return tabPanelExists(document, interaction.group, interaction.tab)
				? null
				: `Panel tab "${interaction.group}/${interaction.tab}" tidak ada.`;
		case "expand":
		case "collapse":
		case "toggle":
			return exists(document, ATTR.region, interaction.target)
				? null
				: `Area "${interaction.target}" tidak ada di layar ini.`;
		case "filter_collection":
			return exists(document, ATTR.collection, interaction.collection)
				? null
				: `Koleksi "${interaction.collection}" tidak ada di layar ini.`;
		case "validate_form":
		case "submit_mock_form":
			return exists(document, ATTR.form, interaction.form)
				? null
				: `Formulir "${interaction.form}" tidak ada di layar ini.`;
		default:
			return null;
	}
}

function makeFocusable(element: Element) {
	if (
		NATIVE_INTERACTIVE.test(element.localName) &&
		element.hasAttribute("href")
	)
		return;
	if (/^(?:button|input|select|textarea|summary)$/.test(element.localName))
		return;
	if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
	if (!element.hasAttribute("role"))
		element.setAttribute("role", element.localName === "a" ? "link" : "button");
}

/**
 * Reads declared interactions and Studio's canonical navigation out of the
 * document. Anything that cannot be validated or whose target element is gone
 * is dropped and reported, so a manifest never points at a deleted element and
 * is rebuilt from the committed HTML on every load (an edit or revision
 * reconciles automatically; nothing is persisted that could go stale).
 *
 * Mutates the document: valid interactions receive `data-ev-ix`, and sensitive
 * fields are flagged so the runtime never keeps their values.
 */
export function extractStudioPrototypeManifest(
	document: Document,
	context: Context,
): StudioPrototypeManifestResult {
	const issues: StudioPrototypeIssue[] = [];
	const interactions: Record<string, StudioPrototypeInteraction> = {};
	let legacyMapped = 0;
	let next = 1;
	const report = (issue: StudioPrototypeIssue) => {
		if (issues.length < STUDIO_PROTOTYPE_LIMITS.issues) issues.push(issue);
	};
	// Stale markers can only come from stored HTML, never from the model.
	for (const node of document.querySelectorAll(
		`[${STUDIO_PROTOTYPE_IX_ATTR}],[${STUDIO_PROTOTYPE_SENSITIVE_ATTR}]`,
	)) {
		node.removeAttribute(STUDIO_PROTOTYPE_IX_ATTR);
		node.removeAttribute(STUDIO_PROTOTYPE_SENSITIVE_ATTR);
	}
	const register = (
		element: Element,
		raw: Record<string, unknown>,
		type: string,
	) => {
		if (
			Object.keys(interactions).length >= STUDIO_PROTOTYPE_LIMITS.interactions
		) {
			report({
				code: "TOO_MANY_INTERACTIONS",
				message: "Jumlah interaksi melebihi batas prototipe.",
			});
			return;
		}
		const ix = `ix-${next}`;
		const parsed = studioPrototypeInteractionSchema.safeParse({
			ix,
			type,
			...raw,
		});
		if (!parsed.success) {
			report({
				code: "INVALID_PARAMETER",
				message: `Parameter aksi "${type}" tidak valid.`,
			});
			return;
		}
		const interaction = parsed.data;
		const missing = missingTarget(document, interaction);
		if (missing) {
			report({ code: "MISSING_TARGET_ELEMENT", message: missing });
			return;
		}
		if (interaction.type === "navigate" && interaction.screenId === null)
			report({
				code: "UNKNOWN_SCREEN",
				message: `Halaman "${interaction.requested || "(kosong)"}" tidak ada di proyek ini.`,
			});
		next += 1;
		interactions[ix] = interaction;
		element.setAttribute(STUDIO_PROTOTYPE_IX_ATTR, ix);
		makeFocusable(element);
	};

	for (const element of document.querySelectorAll(`[${ATTR.action}]`)) {
		const type = attr(element, ATTR.action) ?? "";
		if (!(STUDIO_PROTOTYPE_ACTIONS as readonly string[]).includes(type)) {
			report({
				code: "UNKNOWN_ACTION",
				message: `Aksi "${type.slice(0, 40)}" tidak didukung.`,
			});
			continue;
		}
		register(element, candidate(element, type, context), type);
	}

	// Canonical navigation Studio itself assembled: map it deterministically.
	const primaryAction = context.blueprint?.navigationContract.primaryAction;
	for (const element of document.querySelectorAll(
		"[data-destination],[data-studio-back],[data-studio-action]",
	)) {
		if (element.hasAttribute(STUDIO_PROTOTYPE_IX_ATTR)) continue;
		if (element.hasAttribute(ATTR.action)) continue;
		const before = next;
		if (element.hasAttribute("data-studio-back")) {
			register(element, {}, "back");
		} else if (element.hasAttribute("data-destination")) {
			register(
				element,
				resolveStudioPrototypeTarget(
					attr(element, "data-destination") ?? "",
					context.screens,
					context.blueprint,
				),
				"navigate",
			);
		} else {
			const id = attr(element, "data-studio-action") ?? "";
			const href = (attr(element, "href") ?? "").replace(/^#/, "");
			const requested =
				primaryAction && primaryAction.id === id ? primaryAction.target : href;
			register(
				element,
				resolveStudioPrototypeTarget(
					requested,
					context.screens,
					context.blueprint,
				),
				"navigate",
			);
		}
		if (next > before) legacyMapped += 1;
	}

	// Model-composed links: `#screen` that is not a real in-page anchor.
	const anchorIds = new Set(
		[...document.querySelectorAll("[id]")].map((node) => node.id),
	);
	for (const element of document.querySelectorAll('a[href^="#"]')) {
		if (element.hasAttribute(STUDIO_PROTOTYPE_IX_ATTR)) continue;
		const fragment = (attr(element, "href") ?? "").slice(1);
		if (!fragment || anchorIds.has(fragment)) continue;
		const resolved = resolveStudioPrototypeTarget(
			fragment,
			context.screens,
			context.blueprint,
		);
		if (!resolved.screenId) continue;
		const before = next;
		register(element, resolved, "navigate");
		if (next > before) legacyMapped += 1;
	}

	for (const field of document.querySelectorAll("input,textarea")) {
		const hint = `${field.getAttribute("type") ?? ""} ${field.getAttribute("name") ?? ""} ${field.id} ${field.getAttribute("autocomplete") ?? ""}`;
		if (
			(field.getAttribute("type") ?? "").toLowerCase() === "password" ||
			SENSITIVE_FIELD.test(hint)
		) {
			field.setAttribute(STUDIO_PROTOTYPE_SENSITIVE_ATTR, "1");
			field.setAttribute("autocomplete", "off");
			report({
				code: "SENSITIVE_FIELD",
				message:
					"Kolom data sensitif ditandai; prototipe tidak menyimpan nilainya.",
			});
		}
	}
	// Documented initial mock state, bounded and validated as a whole.
	const rawDefaults: Record<string, unknown> = {};
	for (const element of document.querySelectorAll(`[${ATTR.defaultKey}]`)) {
		const key = attr(element, ATTR.defaultKey) ?? "";
		const value = studioPrototypeStateValueSchema.safeParse(
			attr(element, ATTR.defaultValue) ?? "",
		);
		if (studioPrototypeStateKeySchema.safeParse(key).success && value.success)
			rawDefaults[key] = value.data;
	}
	const parsedDefaults = studioPrototypeStateSchema.safeParse(rawDefaults);
	if (!parsedDefaults.success && Object.keys(rawDefaults).length > 0)
		report({
			code: "INVALID_PARAMETER",
			message: "State awal prototipe melebihi batas dan diabaikan.",
		});
	// Links that stay inert: honest count, never pretended to work.
	let inertLinks = 0;
	for (const element of document.querySelectorAll("a")) {
		const href = element.getAttribute("href");
		if (
			!element.hasAttribute(STUDIO_PROTOTYPE_IX_ATTR) &&
			(href === null || href.trim() === "" || href.trim() === "#")
		)
			inertLinks += 1;
	}
	return {
		interactions,
		defaults: parsedDefaults.success ? parsedDefaults.data : {},
		issues,
		legacyMapped,
		inertLinks,
	};
}
