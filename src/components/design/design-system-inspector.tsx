import { Check, X } from "lucide-react";
import type {
	DesignInspectorModel,
	InspectorFont,
	InspectorTypeEntry,
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

function isSafeFontWeight(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return (
		/^[1-9]00$/.test(normalized) ||
		normalized === "bold" ||
		normalized === "normal"
	);
}

function isSafeLineHeight(value: string): boolean {
	const normalized = value.trim();
	return /^[\d.]+$/.test(normalized) || isCssLength(normalized);
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
	if (isCssLength(entry.size)) style.fontSize = `min(${entry.size}, 2.5rem)`;
	if (isSafeFontWeight(entry.weight)) style.fontWeight = entry.weight;
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
						<ul className="flex flex-col gap-4">
							{model.colors.map((color) => (
								<li key={`${color.name}-${color.value}`} className="flex gap-3">
									<div
										role="img"
										aria-label={`Swatch warna ${color.name} ${color.value}`}
										className="h-12 w-12 shrink-0 rounded-lg border border-graphite"
										style={{ backgroundColor: color.value }}
									/>
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-snow">
											{color.name}
										</p>
										<p className="truncate font-mono text-xs text-fog">
											{color.value}
										</p>
										{color.role ? (
											<p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fog">
												{color.role}
											</p>
										) : null}
									</div>
								</li>
							))}
						</ul>
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
