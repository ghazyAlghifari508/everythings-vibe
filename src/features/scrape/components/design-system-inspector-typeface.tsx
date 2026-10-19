import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { InspectorTypeface } from "@/features/scrape/utils/design-md-inspector";
import {
	FALLBACK_SAMPLE,
	isSafeFontFamily,
} from "./design-system-inspector-css-values";

export function TypefaceCard({ typeface }: { typeface: InspectorTypeface }) {
	const rows: [string, string][] = [
		["Peran", typeface.roles.join(", ") || "—"],
		["Weight terukur", typeface.weights.join(", ") || "—"],
		["Variasi ukuran", typeface.sizes.join(", ") || "—"],
		["Line height", [...new Set(typeface.lineHeights)].join(", ") || "—"],
		["Letter spacing", [...new Set(typeface.letterSpacings)].join(", ") || "—"],
	];
	// Prefer a real sample from the page; the fallback sentence is only used when
	// the capture recorded no text for this family.
	const specimen = typeface.sample.trim() || FALLBACK_SAMPLE;
	return (
		<div className="min-w-0 rounded-lg border border-graphite p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<p className="text-sm font-semibold text-snow">{typeface.family}</p>
				<p className="font-mono text-[11px] text-slate">
					{typeface.loadedEvidence ? "font resource loaded" : "unverified"}
				</p>
			</div>
			<dl className="mt-2 space-y-1 text-xs">
				{rows.map(([label, value]) => (
					<div key={label} className="flex gap-2">
						<dt className="w-32 shrink-0 font-mono text-fog">{label}</dt>
						<dd className="min-w-0 break-words font-mono text-mist">{value}</dd>
					</div>
				))}
			</dl>
			<p
				className="mt-3 break-words text-lg text-mist"
				style={
					isSafeFontFamily(typeface.family)
						? { fontFamily: typeface.stack }
						: undefined
				}
			>
				{specimen}
			</p>
			{/* The fallback is stated when the family is not the one that rendered,
			    so the specimen is never mistaken for the real font. */}
			<p className="mt-1.5 text-[11px] leading-4 text-fog">
				Pratinjau memakai font yang tersedia di browser Anda
				{typeface.loadedEvidence
					? "; status resource font sudah terverifikasi dimuat."
					: "; font yang benar-benar dipakai glyph belum terverifikasi."}
			</p>
			<details className="mt-2">
				<summary className="cursor-pointer font-mono text-[11px] text-slate hover:text-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo">
					Stack & bukti font
				</summary>
				<p className="mt-1 min-w-0 break-words font-mono text-[11px] leading-4 text-mist">
					{typeface.stack}
				</p>
				{typeface.uncertainty ? (
					<p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-fog">
						<Icon
							icon={Alert02Icon}
							size={12}
							aria-hidden
							className="mt-0.5 shrink-0"
						/>
						{typeface.uncertainty}
					</p>
				) : null}
			</details>
		</div>
	);
}
