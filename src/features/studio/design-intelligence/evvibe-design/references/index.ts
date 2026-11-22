import type { EvvibeDesignReference } from "../skill-contract";
import { accessibility } from "./accessibility";
import { antiSlop } from "./anti-slop";
import { componentLibrary } from "./component-library";
import { designReasoning } from "./design-reasoning";
import { mediaAndImagery } from "./media-and-imagery";
import { mobileDesign } from "./mobile-design";
import { navigationPatterns } from "./navigation-patterns";
import { typographyAndLayout } from "./typography-and-layout";
import { webDesign } from "./web-design";

/** Declaration order is irrelevant here; each stage declares its own order. */
export const EVVIBE_DESIGN_REFERENCES: readonly EvvibeDesignReference[] = [
	designReasoning,
	webDesign,
	mobileDesign,
	navigationPatterns,
	typographyAndLayout,
	componentLibrary,
	mediaAndImagery,
	accessibility,
	antiSlop,
];
