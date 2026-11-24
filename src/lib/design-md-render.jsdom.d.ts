// Minimal ambient types for the jsdom devDependency; DOM objects use lib.dom.
declare module "jsdom" {
	export interface JSDOMOptions {
		includeNodeLocations?: boolean;
		url?: string;
		runScripts?: "outside-only" | "dangerously" | undefined;
		pretendToBeVisual?: boolean;
	}
	export class JSDOM {
		constructor(html?: string, options?: JSDOMOptions);
		readonly window: Window & typeof globalThis;
		nodeLocation(node: Node): {
			startOffset: number;
			endOffset: number;
			startTag?: { startOffset: number; endOffset: number };
			endTag?: { startOffset: number; endOffset: number };
		} | null;
	}
}
