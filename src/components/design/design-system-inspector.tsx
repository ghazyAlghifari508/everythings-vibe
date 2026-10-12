"use client";

import { AlertTriangle, Check, Copy, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
	DesignInspectorModel,
	InspectorColorToken,
	InspectorGuideline,
	InspectorRadiusToken,
	InspectorToken,
	InspectorTypeEntry,
	InspectorTypeface,
} from "@/lib/design-md-inspector";
import { firstCssLength } from "@/lib/design-md-inspector";
import { cn } from "@/lib/utils";

export interface DesignSystemInspectorProps {
	siteName: string;
	sourceUrl: string;
	model: DesignInspectorModel;
}

// A specimen sentence only stands in for text the capture did not record; when a
// real sample exists it is used instead.
const FALLBACK_SAMPLE = "The quick brown fox jumps over the lazy dog";

function isCssLength(value: string): boolean {
	return /^[\d.]+(px|rem|em|%)$/.test(value.trim());
}

function isSafeFontFamily(value: string): boolean {
	return /^[\w\s,'"-]+$/.test(value.trim());
}

function isSafeLineHeight(value: string): boolean {
	const normalized = value.trim();
	return /^[\d.]+$/.test(normalized) || isCssLength(normalized);
}

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
	other: "Belum terklasifikasi",
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

function SectionHeading({ children }: { children: string }) {
	return (
		<h3 className="text-base font-semibold tracking-tight text-snow">
			{children}
		</h3>
	);
}

function InspectorSection({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section aria-label={label} className="border-t border-graphite pt-6">
			<SectionHeading>{label}</SectionHeading>
			{description ? (
				<p className="mt-1 text-xs leading-5 text-fog">{description}</p>
			) : null}
			<div className="mt-4">{children}</div>
		</section>
	);
}

function themeLabel(theme: DesignInspectorModel["theme"]): string | null {
	if (theme === "light") return "Terang";
	if (theme === "dark") return "Gelap";
	return null;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

function PaletteColorCard({
	color,
	featured,
}: {
	color: InspectorColorToken;
	featured: boolean;
}) {
	const [copied, setCopied] = useState(false);
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
			return;
		}
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
				<p className="text-sm font-semibold text-snow">{color.role}</p>
				<p className="mt-0.5 font-mono text-xs text-fog tabular-nums">
					{color.value}
					{color.token ? (
						<span className="ml-2 text-slate">{color.token}</span>
					) : null}
				</p>
				{/* The rationale is the audit trail: it names the measured usage
				    behind the role instead of asserting a brand identity. */}
				{color.rationale ? (
					<p className="mt-1.5 text-xs leading-5 text-fog">{color.rationale}</p>
				) : null}
				<p className="mt-1 font-mono text-[11px] text-slate">
					{color.confidence}
					{color.frequency > 0 ? ` · ${color.frequency} elemen` : ""}
				</p>
			</div>
		</div>
	);
}

function PaletteGroupSection({ group }: { group: PaletteGroup }) {
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

// ---------------------------------------------------------------------------
// Type scale
// ---------------------------------------------------------------------------

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

function TypeSpecimenRow({ entry }: { entry: InspectorTypeEntry }) {
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
					{entry.size} dan rasio antar peran tetap.
				</p>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Typeface inspector
// ---------------------------------------------------------------------------

function TypefaceCard({ typeface }: { typeface: InspectorTypeface }) {
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
				<div className="flex gap-2">
					<dt className="w-32 shrink-0 font-mono text-fog">CSS stack</dt>
					<dd className="min-w-0 break-words font-mono text-mist">
						{typeface.stack}
					</dd>
				</div>
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
			{typeface.uncertainty ? (
				<p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-fog">
					<AlertTriangle size={12} aria-hidden className="mt-0.5 shrink-0" />
					{typeface.uncertainty}
				</p>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Spacing, shapes, elevation
// ---------------------------------------------------------------------------

function SpacingRow({ token }: { token: InspectorToken }) {
	const px = token.value.trim().match(/^([\d.]+)px$/);
	const width =
		px?.[1] !== undefined ? Math.min(180, Math.max(4, Number(px[1]))) : null;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
			<div className="min-w-0">
				<p className="text-sm text-snow">{token.label}</p>
				<p className="font-mono text-xs text-fog tabular-nums">
					{token.value}
					{token.frequency > 1 ? (
						<span className="ml-2 text-slate">{token.frequency} elemen</span>
					) : null}
				</p>
			</div>
			{width !== null && Number.isFinite(width) ? (
				<div
					aria-hidden="true"
					className="h-2 shrink-0 rounded-sm bg-steel"
					style={{ width }}
				/>
			) : null}
		</div>
	);
}

function RadiusRow({ token }: { token: InspectorRadiusToken }) {
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0 flex-1">
				<p className="text-sm text-snow">{token.label}</p>
				<p className="font-mono text-xs text-fog tabular-nums">
					{token.value}
					{token.frequency > 1 ? (
						<span className="ml-2 text-slate">{token.frequency} elemen</span>
					) : null}
				</p>
			</div>
			{/* A real rounded-corner preview at the measured radius. */}
			<div
				aria-hidden="true"
				className="size-12 shrink-0 border border-graphite bg-onyx"
				style={
					Number.isFinite(token.valuePx)
						? { borderRadius: `${Math.min(24, token.valuePx)}px` }
						: undefined
				}
			/>
		</div>
	);
}

function GuidelineList({
	rules,
	tone,
}: {
	rules: InspectorGuideline[];
	tone: "do" | "dont";
}) {
	return (
		<ul className="flex flex-col gap-3">
			{rules.map((rule) => (
				<li key={rule.rule} className="flex items-start gap-2">
					{tone === "do" ? (
						<Check
							size={15}
							strokeWidth={2.5}
							className="mt-0.5 shrink-0 text-emerald-400"
							aria-hidden="true"
						/>
					) : (
						<X
							size={15}
							strokeWidth={2.5}
							className="mt-0.5 shrink-0 text-crimson"
							aria-hidden="true"
						/>
					)}
					<span className="min-w-0">
						<span className="block text-sm leading-relaxed text-mist">
							{rule.rule}
						</span>
						{rule.evidence ? (
							<span className="mt-0.5 block text-[11px] leading-4 text-fog">
								{rule.evidence}
							</span>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

export function DesignSystemInspector({
	siteName,
	sourceUrl,
	model,
}: DesignSystemInspectorProps) {
	const theme = themeLabel(model.theme);
	let canonicalSourceUrl: string | null = null;
	try {
		const parsedSourceUrl = new URL(sourceUrl);
		if (
			parsedSourceUrl.protocol === "http:" ||
			parsedSourceUrl.protocol === "https:"
		)
			canonicalSourceUrl = sourceUrl;
	} catch {
		canonicalSourceUrl = null;
	}

	const hasShapes = model.spacing.length > 0 || model.radii.length > 0;
	const hasGuidance = model.dos.length > 0 || model.donts.length > 0;

	return (
		<div className="min-w-0">
			<div>
				<p className="font-mono text-xs tracking-wider text-fog uppercase">
					Style Inspector
				</p>
				<h2 className="mt-1 text-2xl font-bold tracking-tight text-snow">
					{siteName}
				</h2>
				{canonicalSourceUrl ? (
					<p className="mt-1 min-w-0 font-mono text-xs text-fog/70">
						<a
							href={canonicalSourceUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="text-indigo underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							style={{ overflowWrap: "anywhere" }}
						>
							{canonicalSourceUrl}
						</a>
					</p>
				) : sourceUrl ? (
					<p
						className="mt-1 min-w-0 font-mono text-xs text-fog/70"
						style={{ overflowWrap: "anywhere" }}
					>
						{sourceUrl}
					</p>
				) : null}
				{model.essence ? (
					<p className="mt-3 text-sm leading-relaxed text-mist">
						{model.essence}
					</p>
				) : null}
				{model.overview ? (
					<p className="mt-2 text-sm leading-relaxed text-fog">
						{model.overview}
					</p>
				) : null}
				{theme ? (
					<p className="mt-2 font-mono text-xs text-fog">Tema: {theme}</p>
				) : null}
			</div>

			<div className="mt-6 flex flex-col gap-6">
				<p
					className={cn(
						"flex items-start gap-2 rounded-lg border p-3 text-xs leading-5",
						model.verification === "observed"
							? "border-graphite text-fog"
							: "border-graphite text-mist",
					)}
				>
					{model.verification === "observed" ? (
						<Info size={14} aria-hidden className="mt-0.5 shrink-0" />
					) : (
						<AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
					)}
					<span>
						{model.verification === "observed"
							? "Sumber: pengukuran browser. Peran warna mengikuti penggunaan elemen yang terukur, bukan klaim brand yang belum terbukti."
							: "Hasil lama belum terverifikasi terhadap evidence browser. Nilai di bawah adalah hasil parsing dokumen arsip, bukan pengukuran."}
					</span>
				</p>

				{model.colors.length > 0 ? (
					<InspectorSection
						label="Palet Warna"
						description="Warna dikelompokkan dari peran yang terukur, dengan alasan di balik setiap peran."
					>
						<div className="flex min-w-0 flex-col gap-6">
							{groupPaletteColors(model.colors).map((group) => (
								<PaletteGroupSection key={group.key} group={group} />
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.typography.length > 0 ? (
					<InspectorSection
						label="Type Scale"
						description="Satu specimen representatif per peran skala, ditampilkan pada ukuran terukurnya."
					>
						<div className="flex flex-col gap-4">
							{model.typography.map((entry) => (
								<TypeSpecimenRow
									key={`${entry.role}-${entry.size}`}
									entry={entry}
								/>
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.typefaces.length > 0 ? (
					<InspectorSection
						label="Typeface Inspector"
						description="Family, weight, dan rentang ukuran yang benar-benar terukur pada teks halaman."
					>
						<div className="flex flex-col gap-4">
							{model.typefaces.map((typeface) => (
								<TypefaceCard key={typeface.family} typeface={typeface} />
							))}
						</div>
					</InspectorSection>
				) : null}

				{hasShapes ? (
					<InspectorSection
						label="Spacing & Bentuk"
						description="Nilai dikelompokkan menurut konteks pemakaiannya, bukan sebagai daftar properti."
					>
						<div className="flex flex-col gap-6">
							{Number.isFinite(model.baseUnitPx) ? (
								<p className="font-mono text-xs text-fog">
									Unit dasar {model.baseUnitPx}px
								</p>
							) : null}
							{model.spacing.length > 0 ? (
								<div className="flex flex-col gap-3">
									<h4 className="text-sm font-semibold text-mist">Spacing</h4>
									{model.spacing.map((token) => (
										<SpacingRow
											key={`${token.label}-${token.value}`}
											token={token}
										/>
									))}
								</div>
							) : null}
							{model.radii.length > 0 ? (
								<div className="flex flex-col gap-3">
									<h4 className="text-sm font-semibold text-mist">
										Border Radius
									</h4>
									{model.radii.map((token) => (
										<RadiusRow
											key={`${token.label}-${token.value}`}
											token={token}
										/>
									))}
								</div>
							) : null}
						</div>
					</InspectorSection>
				) : null}

				{model.surfaces.length > 0 ? (
					<InspectorSection
						label="Surface"
						description="Lapisan latar yang terukur, dari kanvas halaman ke permukaan yang lebih tinggi."
					>
						<div className="flex flex-col gap-2">
							{model.surfaces.map((surface) => (
								<div
									key={surface.value}
									className="flex items-center gap-3 rounded-lg border border-graphite p-3"
								>
									<div
										aria-hidden="true"
										className="size-8 shrink-0 rounded-md border border-graphite"
										style={{ backgroundColor: surface.value }}
									/>
									<div className="min-w-0">
										<p className="font-mono text-xs text-snow">
											{surface.value}
										</p>
										<p className="text-[11px] text-fog">
											Level {surface.level} · {surface.frequency} elemen ·{" "}
											{surface.roles.join(", ")}
										</p>
									</div>
								</div>
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.elevation.length > 0 ? (
					<InspectorSection
						label="Elevation"
						description="Shadow yang benar-benar terukur, beserta jumlah elemen yang memakainya."
					>
						<div className="flex flex-col gap-3">
							{model.elevation.map((token) => (
								<div
									key={token.value}
									className="min-w-0 rounded-lg border border-graphite p-3"
								>
									<div
										aria-hidden="true"
										className="mb-2 h-12 rounded-md bg-obsidian"
										style={{ boxShadow: token.value }}
									/>
									<p className="break-all font-mono text-[11px] text-mist">
										{token.value}
									</p>
									<p className="mt-1 text-[11px] leading-4 text-fog">
										{token.usageNote}
									</p>
								</div>
							))}
						</div>
					</InspectorSection>
				) : null}

				{hasGuidance ? (
					<InspectorSection
						label="Panduan Desain"
						description="Setiap aturan diturunkan dari pola terukur yang berulang."
					>
						<div className="grid gap-6 sm:grid-cols-2">
							{model.dos.length > 0 ? (
								<div>
									<p className="text-sm font-semibold text-snow">Do</p>
									<div className="mt-3">
										<GuidelineList rules={model.dos} tone="do" />
									</div>
								</div>
							) : null}
							{model.donts.length > 0 ? (
								<div>
									<p className="text-sm font-semibold text-snow">Don&apos;t</p>
									<div className="mt-3">
										<GuidelineList rules={model.donts} tone="dont" />
									</div>
								</div>
							) : null}
						</div>
					</InspectorSection>
				) : null}

				{model.limitations.length > 0 ? (
					<InspectorSection label="Keterbatasan Pengukuran">
						<ul className="flex flex-col gap-2">
							{model.limitations.map((limitation) => (
								<li
									key={limitation}
									className="flex items-start gap-2 text-xs leading-5 text-fog"
								>
									<span aria-hidden="true" className="mt-1.5 shrink-0">
										<span className="block size-1 rounded-full bg-slate" />
									</span>
									{limitation}
								</li>
							))}
						</ul>
					</InspectorSection>
				) : null}
			</div>
		</div>
	);
}
