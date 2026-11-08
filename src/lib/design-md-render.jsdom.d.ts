// Minimal ambient types for the jsdom devDependency, which ships no
// declarations of its own. Only the surface the render suite uses is
// modelled; the DOM types come from the compiler DOM library.
declare module "jsdom" {
	export interface JSDOMOptions {
		includeNodeLocations?: boolean;
		url?: string;
		runScripts?: "outside-only" | "dangerously" | undefined;
	}
	export class JSDOM {
		constructor(html?: string, options?: JSDOMOptions);
		readonly window: Window;
		nodeLocation(node: Node): { startTag?: { endOffset: number } } | null;
	}
}
