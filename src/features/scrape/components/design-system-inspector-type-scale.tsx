import {
	firstCssLength,
	type InspectorTypeEntry,
} from "@/features/scrape/utils/design-md-inspector";
import {
	FALLBACK_SAMPLE,
	isSafeFontFamily,
	isSafeLineHeight,
} from "./design-system-inspector-css-values";

// A display heading must read as a display heading. Capping the preview at a
// fixed size made a 64px style look identical to body copy, so the specimen is
// rendered at its measured size. Very large sizes are scaled down by a single
// shared factor so the row stays inside the panel while every role keeps its
// real proportion to the others.
const SPECIMEN_MAX_PX = 48;

function specimenFontSize(sizePx: number): string | null {
	if (!Number.isFinite(sizePx) || sizePx <= 0) return null;
	const rendered = Math.min(sizePx, SPECIMEN_MAX_PX);
	return `${Number(rendered.toFixed(1))}px`;
}

export function TypeSpecimenRow({ entry }: { entry: InspectorTypeEntry }) {
	const style: React.CSSProperties = {};
	const size = firstCssLength(entry.size);
	const specimenSize = specimenFontSize(entry.sizePx);
	if (specimenSize) style.fontSize = specimenSize;
	else if (size) style.fontSize = size;
	if (entry.weight) style.fontWeight = entry.weight;
	if (isSafeLineHeight(entry.lineHeight)) style.lineHeight = entry.lineHeight;
	if (entry.family && isSafeFontFamily(entry.family))
		style.fontFamily = entry.family;
	const meta = [
		entry.size,
		entry.weight ? `w${entry.weight}` : "",
		entry.lineHeight ? `lh ${entry.lineHeight}` : "",
		entry.letterSpacing ? `ls ${entry.letterSpacing}` : "",
	]
		.filter((part) => part.length > 0)
		.join(" · ");
	const sample = entry.sample.trim() || FALLBACK_SAMPLE;
	const scaled =
		Number.isFinite(entry.sizePx) && entry.sizePx > SPECIMEN_MAX_PX;
	return (
		<div className="min-w-0 border-b border-graphite pb-4 last:border-b-0">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-sm font-semibold text-snow">{entry.role}</span>
				<span className="font-mono text-xs text-fog tabular-nums">{meta}</span>
			</div>
			{/* Full-width specimen at the measured scale, wrapping instead of
			    truncating so the size is actually visible. */}
			<p className="mt-2 break-words text-mist" style={style}>
				{sample}
			</p>
			{scaled ? (
				<p className="mt-1 text-[11px] leading-4 text-fog">
					Ditampilkan pada {SPECIMEN_MAX_PX}px agar muat; ukuran terukur{" "}
					{entry.size}.
				</p>
			) : null}
		</div>
	);
}
