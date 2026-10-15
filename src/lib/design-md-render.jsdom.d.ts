// Minimal ambient types for the jsdom devDependency, which ships no
// declarations of its own. Only the surface the render suite uses is
// modelled; the DOM types come from the compiler DOM library.
declare module "jsdom" {
	export class JSDOM {
		constructor(html?: string);
		readonly window: Window;
	}
}
