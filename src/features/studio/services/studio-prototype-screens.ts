import type { StudioFrameRow } from "@/db/schema";
import {
	STUDIO_PROTOTYPE_LIMITS,
	type StudioPrototypeScreen,
} from "../types/studio-prototype";
import { normalizeDestinationId } from "./studio-blueprint-navigation";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

type ScreenFrame = Pick<StudioFrameRow, "id" | "name" | "status" | "htmlCode"> &
	Partial<Pick<StudioFrameRow, "order">>;

function key(value: string): string {
	return normalizeDestinationId(value.trim());
}

/**
 * The project's real, viewable pages. A page exists only when its frame has
 * finished generating and carries HTML: removed, queued or failed frames never
 * appear, so the viewer cannot navigate to a page that is not there.
 *
 * Identity is the frame id. The route is the planned primary destination when
 * the blueprint owns one (a stable, meaningful identifier), otherwise a slug of
 * the name; collisions get a numeric suffix so two routes never share a path.
 */
export function deriveStudioPrototypeScreens(
	frames: readonly ScreenFrame[],
	blueprint: StudioDesignBlueprint | null | undefined,
): StudioPrototypeScreen[] {
	const viewable = frames
		.filter((frame) => frame.status === "ready" && Boolean(frame.htmlCode))
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.slice(0, STUDIO_PROTOTYPE_LIMITS.screens);
	const taken = new Set<string>();
	const owners = new Set<string>();
	return viewable.map((frame, index) => {
		const plan = blueprint?.screenPlan.find(
			(entry) => entry.name === frame.name,
		);
		// A contextual screen's "active destination" is its parent's, so only a
		// primary screen may own a destination.
		const ownsDestination = plan?.navigationRole !== "contextual";
		const declared = ownsDestination
			? (plan?.destinationId ??
				blueprint?.canonicalShell?.activeDestinations[frame.name] ??
				null)
			: null;
		const destinationId = declared && !owners.has(declared) ? declared : null;
		if (destinationId) owners.add(destinationId);
		const base = key(destinationId ?? frame.name);
		let slug = base;
		for (let counter = 2; taken.has(slug); counter += 1)
			slug = `${base}-${counter}`;
		taken.add(slug);
		return {
			id: frame.id,
			name: frame.name,
			route: `/${slug}`.slice(0, 61),
			destinationId,
			order: index,
		};
	});
}

export type StudioPrototypeTargetResolution = {
	screenId: string | null;
	requested: string;
};

/**
 * Resolves what generated markup asked for to a real screen id. Stable
 * identifiers win (id, destination, route); display names are a last resort.
 * A request that matches nothing resolves to `null`: it is never guessed.
 */
export function resolveStudioPrototypeTarget(
	requested: string,
	screens: readonly StudioPrototypeScreen[],
	blueprint?: StudioDesignBlueprint | null,
): StudioPrototypeTargetResolution {
	const raw = requested.trim().replace(/^#/, "");
	const none = { screenId: null, requested: raw.slice(0, 120) };
	if (!raw) return none;
	const exact =
		screens.find((screen) => screen.id === raw) ??
		screens.find((screen) => screen.destinationId === raw) ??
		screens.find(
			(screen) => screen.route === (raw.startsWith("/") ? raw : `/${raw}`),
		);
	if (exact) return { screenId: exact.id, requested: raw.slice(0, 120) };
	const wanted = key(raw);
	const byName = screens.find((screen) => key(screen.name) === wanted);
	if (byName) return { screenId: byName.id, requested: raw.slice(0, 120) };
	// A navigation label ("Jelajah") may differ from the screen name.
	const contract = blueprint?.navigationContract;
	const labelIndex =
		contract?.labels.findIndex((label) => key(label) === wanted) ?? -1;
	const destination =
		labelIndex >= 0 ? contract?.destinations[labelIndex] : null;
	const byLabel = destination
		? screens.find((screen) => screen.destinationId === destination)
		: undefined;
	return byLabel
		? { screenId: byLabel.id, requested: raw.slice(0, 120) }
		: none;
}
