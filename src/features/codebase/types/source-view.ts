/**
 * Rendering token produced by the source highlighter. Shared by the highlight
 * builder, the row cache, and the viewer facade: keeping it in `types/` stops
 * those three modules from importing each other in a cycle.
 */
export interface SourceToken {
	/** Raw source text, already decoded for safe rendering. */
	text: string;
	/** Highlighter token class, or null for unhighlighted text. */
	className: string | null;
}
