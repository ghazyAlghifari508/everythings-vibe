import type { StudioElementIdentity } from "../types/studio-element";
import type {
	StudioRendererFailure,
	StudioRendererMetrics,
	StudioRendererReadiness,
} from "../types/studio-renderer";

export interface StudioLiveDocument {
	/** Identity of the renderer key that produced this document. */
	keyId: string;
	html: string;
	channel: string;
	projectId: string;
	frameId: string;
	baseRevision: number;
	baseHash: string;
	elements: StudioElementIdentity[];
	unresolvedAssets: number;
	unrenderedIcons: number;
}

export interface StudioLiveSlot {
	document: StudioLiveDocument;
	metrics: StudioRendererMetrics;
	unresolvedImages: number;
}

export interface StudioLiveSlotsState {
	/** Visible, ready document. Stays on screen while a replacement loads. */
	active: StudioLiveSlot | null;
	/** Replacement document loading hidden; swapped in only once ready. */
	incoming: StudioLiveDocument | null;
	failure: { failure: StudioRendererFailure; message: string } | null;
}

export type StudioLiveSlotsAction =
	| { type: "document"; document: StudioLiveDocument }
	| {
			type: "ready";
			channel: string;
			metrics: StudioRendererMetrics;
			unresolvedImages: number;
	  }
	| { type: "metrics"; channel: string; metrics: StudioRendererMetrics }
	| { type: "timeout"; channel: string; message: string }
	| { type: "failed"; failure: StudioRendererFailure; message: string }
	| { type: "reset" };

export const emptyStudioLiveSlots: StudioLiveSlotsState = {
	active: null,
	incoming: null,
	failure: null,
};

/**
 * A result is only applied when it belongs to a document this state still owns:
 * a late `ready` from a replaced channel changes nothing, so a stale document
 * can never overwrite a newer revision.
 */
export function reduceStudioLiveSlots(
	state: StudioLiveSlotsState,
	action: StudioLiveSlotsAction,
): StudioLiveSlotsState {
	switch (action.type) {
		case "document": {
			if (
				state.active?.document.keyId === action.document.keyId ||
				state.incoming?.keyId === action.document.keyId
			)
				return state;
			return { ...state, incoming: action.document, failure: null };
		}
		case "ready": {
			if (state.incoming?.channel === action.channel)
				return {
					active: {
						document: state.incoming,
						metrics: action.metrics,
						unresolvedImages: action.unresolvedImages,
					},
					incoming: null,
					failure: null,
				};
			if (state.active?.document.channel === action.channel)
				return {
					...state,
					active: { ...state.active, metrics: action.metrics },
				};
			return state;
		}
		case "metrics": {
			const active = state.active;
			if (!active || active.document.channel !== action.channel) return state;
			const { scrollWidth, scrollHeight } = active.metrics;
			if (
				scrollWidth === action.metrics.scrollWidth &&
				scrollHeight === action.metrics.scrollHeight
			)
				return state;
			return { ...state, active: { ...active, metrics: action.metrics } };
		}
		case "timeout": {
			if (state.incoming?.channel !== action.channel) return state;
			// The replaced revision is no longer the current one; keep neither
			// stale document interactive, and let the preview carry the frame.
			return {
				active: null,
				incoming: null,
				failure: { failure: "bridge-timeout", message: action.message },
			};
		}
		case "failed":
			return {
				active: null,
				incoming: null,
				failure: { failure: action.failure, message: action.message },
			};
		case "reset":
			return emptyStudioLiveSlots;
	}
}

export function studioLiveReadiness(
	state: StudioLiveSlotsState,
): StudioRendererReadiness {
	if (state.failure)
		return {
			phase: "failed",
			failure: state.failure.failure,
			message: state.failure.message,
		};
	if (!state.active) return { phase: "loading" };
	const { document, metrics, unresolvedImages } = state.active;
	return {
		phase: "ready",
		unresolvedAssets: document.unresolvedAssets + unresolvedImages,
		unrenderedIcons: document.unrenderedIcons,
		scrollWidth: metrics.scrollWidth,
		scrollHeight: metrics.scrollHeight,
	};
}
