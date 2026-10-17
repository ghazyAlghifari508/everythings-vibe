import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InspectorColorToken } from "@/lib/design-md-inspector";
import { cn } from "@/lib/utils";

export type PaletteGroupKey =
	| "brand"
	| "accent"
	| "neutral"
	| "semantic"
	| "other";

export interface PaletteGroup {
	key: PaletteGroupKey;
	label: string;
	colors: InspectorColorToken[];
}

const PALETTE_GROUP_LABELS: Record<PaletteGroupKey, string> = {
	brand: "Brand",
	accent: "Aksen",
	neutral: "Netral",
	semantic: "Semantik",
	other: "Warna lainnya",
};

const PALETTE_GROUP_ORDER: PaletteGroupKey[] = [
	"brand",
	"accent",
	"neutral",
	"semantic",
	"other",
];

// The inspector reads the role class the model already assigned from measured
// usage, so the grouping cannot disagree with the document.
export function classifyPaletteGroup(
	color: InspectorColorToken,
): PaletteGroupKey {
	if (color.roleClass === "brand") return "brand";
	if (color.roleClass === "accent") return "accent";
	if (color.roleClass === "semantic") return "semantic";
	if (color.roleClass === "neutral") return "neutral";
	return "other";
}

export function groupPaletteColors(
	colors: InspectorColorToken[],
): PaletteGroup[] {
	const buckets = new Map<PaletteGroupKey, InspectorColorToken[]>();
	for (const color of colors) {
		const key = classifyPaletteGroup(color);
		const bucket = buckets.get(key) ?? [];
		bucket.push(color);
		buckets.set(key, bucket);
	}
	return PALETTE_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
		key,
		label: PALETTE_GROUP_LABELS[key],
		colors: buckets.get(key) ?? [],
	}));
}

function PaletteColorCard({
	color,
	featured,
}: {
	color: InspectorColorToken;
	featured: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		};
	}, []);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(color.value);
		} catch {
			setCopyFailed(true);
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopyFailed(false), 2000);
			return;
		}
		setCopyFailed(false);
		setCopied(true);
		if (copiedTimer.current) clearTimeout(copiedTimer.current);
		copiedTimer.current = setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className={cn("min-w-0", featured && "sm:col-span-2")}>
			<div className="group relative">
				<div
					role="img"
					aria-label={`Swatch warna ${color.role} ${color.value}`}
					className={cn(
						"w-full rounded-lg border border-graphite",
						featured ? "h-36 sm:h-44" : "h-20 sm:h-24",
					)}
					style={{ backgroundColor: color.value }}
				/>
				<button
					type="button"
					onClick={() => void handleCopy()}
					aria-label={
						copied ? `Tersalin ${color.value}` : `Salin warna ${color.value}`
					}
					className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md border border-graphite bg-obsidian/90 text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
				>
					{copied ? (
						<Check size={15} aria-hidden="true" />
					) : (
						<Copy size={15} aria-hidden="true" />
					)}
				</button>
			</div>
			<div className="mt-2 min-w-0">
				<p className="break-words text-sm font-semibold text-snow">
					{color.role}
				</p>
				<p
					className="mt-0.5 font-mono text-xs break-all text-fog tabular-nums"
					style={{ overflowWrap: "anywhere" }}
				>
					{color.value}
					{color.token ? (
						<span className="ml-2 text-slate">{color.token}</span>
					) : null}
				</p>
				{copyFailed ? (
					<p className="mt-1 text-[11px] leading-4 text-fog">
						Gagal menyalin. Salin manual nilainya.
					</p>
				) : null}
				{color.rationale || color.frequency > 0 ? (
					<details className="group mt-1.5">
						<summary className="cursor-pointer font-mono text-[11px] text-slate hover:text-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo">
							{color.confidence}
							{color.frequency > 0 ? ` · ${color.frequency} elemen` : ""}
							{" · bukti"}
						</summary>
						{color.rationale ? (
							<p className="mt-1 text-xs leading-5 text-fog">
								{color.rationale}
							</p>
						) : null}
					</details>
				) : (
					<p className="mt-1 font-mono text-[11px] text-slate">
						{color.confidence}
					</p>
				)}
			</div>
		</div>
	);
}

export function PaletteGroupSection({ group }: { group: PaletteGroup }) {
	const featured = group.key === "brand" && group.colors.length === 1;
	return (
		<section aria-label={group.label} className="min-w-0">
			<h4 className="text-sm font-semibold text-mist">{group.label}</h4>
			<div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
				{group.colors.map((color) => (
					<PaletteColorCard
						key={`${color.role}-${color.value}`}
						color={color}
						featured={featured}
					/>
				))}
			</div>
		</section>
	);
}
