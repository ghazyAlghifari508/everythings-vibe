"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
	DesignInspectorModel,
	InspectorColorToken,
	InspectorFont,
	InspectorTypeEntry,
} from "@/lib/design-md-inspector";
import {
	firstCssLength,
	normalizeFontWeight,
} from "@/lib/design-md-inspector";

export interface DesignSystemInspectorProps {
	siteName: string;
	domain: string;
	sourceUrl: string;
	model: DesignInspectorModel;
}

const TYPE_PREVIEW_SENTENCE = "The quick brown fox jumps over the lazy dog";

function isCssLength(value: string): boolean {
	return /^[\d.]+(px|rem|em|%)$/.test(value.trim());
}

function isSafeFontFamily(value: string): boolean {
	return /^[\w\s-]+$/.test(value.trim());
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
	other: "Lainnya",
};

const PALETTE_GROUP_ORDER: PaletteGroupKey[] = [
	"brand",
	"accent",
	"neutral",
	"semantic",
	"other",
];

// Surface/what-signals (semantic usage, surface/text roles) are checked before
// priority modifiers (brand/primary, accent), so "Primary text" stays neutral
// while "Primary CTA" stays brand.
const PALETTE_GROUP_PATTERNS: { key: PaletteGroupKey; pattern: RegExp }[] = [
	{ key: "semantic", pattern: /\b(success|warning|error|info)\b/ },
	{ key: "neutral", pattern: /\b(canvas|surface|text|neutral|border|ghost)\b/ },
	{ key: "brand", pattern: /\b(brand|primary)\b/ },
	{ key: "accent", pattern: /\b(accent|decorative|highlight)\b/ },
];

export function classifyPaletteGroup(
	color: InspectorColorToken,
): PaletteGroupKey {
	const haystack = `${color.name} ${color.role} ${color.token}`.toLowerCase();
	for (const { key, pattern } of PALETTE_GROUP_PATTERNS) {
		if (pattern.test(haystack)) return key;
	}
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

	const idleLabel = `Salin warna ${color.value}`;
	const doneLabel = `Tersalin ${color.value}`;

	return (
		<div className={featured ? "min-w-0 sm:col-span-2" : "min-w-0"}>
			<div className="group relative">
				<div
					role="img"
					aria-label={`Swatch warna ${color.name} ${color.value}`}
					className={
						featured
							? "h-36 w-full rounded-lg border border-graphite sm:h-44"
							: "h-24 w-full rounded-lg border border-graphite sm:h-28"
					}
					style={{ backgroundColor: color.value }}
				/>
				<button
					type="button"
					onClick={() => void handleCopy()}
					aria-label={copied ? doneLabel : idleLabel}
					className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md border border-graphite bg-obsidian/90 text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100"
				>
					{copied ? (
						<Check size={15} aria-hidden="true" />
					) : (
						<Copy size={15} aria-hidden="true" />
					)}
				</button>
			</div>
			<div className="mt-2 min-w-0">
				<p
					className="truncate text-sm font-semibold text-snow"
					title={color.name}
				>
					{color.name}
				</p>
				<p
					className="truncate font-mono text-xs text-fog tabular-nums"
					title={color.value}
				>
					{color.value}
				</p>
				{color.role ? (
					<p className="mt-0.5 line-clamp-4 text-xs leading-relaxed text-fog">
						{color.role}
					</p>
				) : null}
			</div>
		</div>
	);
}

function PaletteGroupSection({ group }: { group: PaletteGroup }) {
	const featured = group.key === "brand" && group.colors.length === 1;
	return (
		<section aria-label={group.label} className="min-w-0">
			<h4 className="text-sm font-semibold text-mist">{group.label}</h4>
			<div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
				{group.colors.map((color) => (
					<PaletteColorCard
						key={`${color.name}-${color.value}`}
						color={color}
						featured={featured}
					/>
				))}
			</div>
		</section>
	);
}

function SectionHeading({ children }: { children: string }) {
	return (
		<h3 className="text-lg font-semibold tracking-tight text-snow">
			{children}
		</h3>
	);
}

function InspectorSection({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<section aria-label={label} className="border-t border-graphite pt-6">
			<SectionHeading>{label}</SectionHeading>
			<div className="mt-4">{children}</div>
		</section>
	);
}

function themeLabel(theme: DesignInspectorModel["theme"]): string | null {
	if (theme === "light") return "Terang";
	if (theme === "dark") return "Gelap";
	return null;
}

function TypePreview({ entry }: { entry: InspectorTypeEntry }) {
	const style: React.CSSProperties = {};
	const size = firstCssLength(entry.size);
	if (size) style.fontSize = `min(${size}, 2.5rem)`;
	const weight = normalizeFontWeight(entry.weight);
	if (weight) style.fontWeight = weight;
	if (isSafeLineHeight(entry.lineHeight))
		style.lineHeight = entry.lineHeight;
	if (entry.family && isSafeFontFamily(entry.family)) {
		style.fontFamily = `${entry.family}, sans-serif`;
	}
	const meta = [entry.size, entry.weight, entry.lineHeight]
		.filter((part) => part.length > 0)
		.join(" · ");
	return (
		<div className="min-w-0">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
				<span className="text-sm font-semibold text-snow">{entry.label}</span>
				{meta ? (
					<span className="font-mono text-xs text-fog tabular-nums">{meta}</span>
				) : null}
			</div>
			<p className="mt-1.5 truncate text-mist" style={style}>
				{TYPE_PREVIEW_SENTENCE}
			</p>
		</div>
	);
}

function FontCard({ font, sizes }: { font: InspectorFont; sizes: string[] }) {
	const uniqueSizes = [...new Set(sizes)].filter((size) => size.length > 0);
	return (
		<div className="min-w-0">
			<p className="text-sm font-semibold text-snow">{font.family}</p>
			<dl className="mt-1.5 space-y-1 text-xs">
				<div className="flex gap-2">
					<dt className="w-14 shrink-0 font-mono text-fog">Weight</dt>
					<dd className="min-w-0 truncate font-mono text-mist">
						{font.weights.length > 0 ? font.weights.join(", ") : "—"}
					</dd>
				</div>
				{uniqueSizes.length > 0 ? (
					<div className="flex gap-2">
						<dt className="w-14 shrink-0 font-mono text-fog">Sizes</dt>
						<dd className="min-w-0 truncate font-mono text-mist">
							{uniqueSizes.join(", ")}
						</dd>
					</div>
				) : null}
				{font.roles.length > 0 ? (
					<div className="flex gap-2">
						<dt className="w-14 shrink-0 font-mono text-fog">Peran</dt>
						<dd className="min-w-0 truncate text-mist">
							{font.roles.join(", ")}
						</dd>
					</div>
				) : null}
			</dl>
			<p
				className="mt-2 truncate text-sm text-mist"
				style={
					isSafeFontFamily(font.family)
						? { fontFamily: `${font.family}, sans-serif` }
						: undefined
				}
			>
				{TYPE_PREVIEW_SENTENCE}
			</p>
		</div>
	);
}

function SpacingRow({ label, value }: { label: string; value: string }) {
	const px = value.trim().match(/^([\d.]+)px$/);
	const width =
		px?.[1] !== undefined
			? Math.min(160, Math.max(4, Number(px[1])))
			: null;
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm text-snow">{label}</p>
				<p className="font-mono text-xs text-fog tabular-nums">{value}</p>
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

export function DesignSystemInspector({
	siteName,
	domain,
	sourceUrl,
	model,
}: DesignSystemInspectorProps) {
	const theme = themeLabel(model.theme);
	const sizesByFamily = new Map<string, string[]>();
	for (const entry of model.typography) {
		if (!entry.family || !entry.size) continue;
		const list = sizesByFamily.get(entry.family) ?? [];
		if (!list.includes(entry.size)) list.push(entry.size);
		sizesByFamily.set(entry.family, list);
	}

	return (
		<div className="min-w-0">
			<div>
				<p className="font-mono text-xs uppercase tracking-wider text-fog">
					Style Inspector
				</p>
				<h2 className="mt-1 text-2xl font-bold tracking-tight text-snow">
					{siteName}
				</h2>
				<p className="mt-1 truncate font-mono text-xs text-fog">{domain}</p>
				{sourceUrl ? (
					<p className="mt-0.5 truncate font-mono text-xs text-fog/70">
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
				{model.colors.length > 0 ? (
					<InspectorSection label="Palet Warna">
						<div className="flex min-w-0 flex-col gap-6">
							{groupPaletteColors(model.colors).map((group) => (
								<PaletteGroupSection key={group.key} group={group} />
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.typography.length > 0 ? (
					<InspectorSection label="Tipografi">
						<div className="flex flex-col gap-5">
							{model.typography.map((entry) => (
								<TypePreview
									key={`${entry.label}-${entry.size}`}
									entry={entry}
								/>
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.fonts.length > 0 ? (
					<InspectorSection label="Font">
						<div className="flex flex-col gap-5">
							{model.fonts.map((font) => (
								<FontCard
									key={font.family}
									font={font}
									sizes={sizesByFamily.get(font.family) ?? []}
								/>
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.spacing.length > 0 || model.radii.length > 0 ? (
					<InspectorSection label="Spasi & Bentuk">
						<div className="flex flex-col gap-4">
							{model.baseUnit ? (
								<p className="font-mono text-xs text-fog">
									Unit dasar {model.baseUnit}
								</p>
							) : null}
							{model.spacing.map((token) => (
								<SpacingRow
									key={`spacing-${token.label}-${token.value}`}
									label={token.label}
									value={token.value}
								/>
							))}
							{model.radii.map((token) => (
								<div
									key={`radius-${token.label}-${token.value}`}
									className="flex items-center gap-3"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm text-snow">{token.label}</p>
										<p className="font-mono text-xs text-fog tabular-nums">
											{token.value}
										</p>
									</div>
									<div
										aria-hidden="true"
										className="h-10 w-16 shrink-0 border border-graphite bg-onyx"
										style={
											isCssLength(token.value)
												? { borderRadius: token.value }
												: undefined
										}
									/>
								</div>
							))}
						</div>
					</InspectorSection>
				) : null}

				{model.dos.length > 0 || model.donts.length > 0 ? (
					<InspectorSection label="Panduan Desain">
						<div className="grid gap-6 sm:grid-cols-2">
							{model.dos.length > 0 ? (
								<div>
									<p className="text-sm font-semibold text-snow">Do</p>
									<ul className="mt-2 flex flex-col gap-2">
										{model.dos.map((rule) => (
											<li
												key={rule}
												className="flex items-start gap-2 text-sm leading-relaxed text-mist"
											>
												<Check
													size={15}
													strokeWidth={2.5}
													className="mt-0.5 shrink-0 text-emerald-400"
													aria-hidden="true"
												/>
												<span>{rule}</span>
											</li>
										))}
									</ul>
								</div>
							) : null}
							{model.donts.length > 0 ? (
								<div>
									<p className="text-sm font-semibold text-snow">Don&apos;t</p>
									<ul className="mt-2 flex flex-col gap-2">
										{model.donts.map((rule) => (
											<li
												key={rule}
												className="flex items-start gap-2 text-sm leading-relaxed text-mist"
											>
												<X
													size={15}
													strokeWidth={2.5}
													className="mt-0.5 shrink-0 text-crimson"
													aria-hidden="true"
												/>
												<span>{rule}</span>
											</li>
										))}
									</ul>
								</div>
							) : null}
						</div>
					</InspectorSection>
				) : null}
			</div>
		</div>
	);
}
