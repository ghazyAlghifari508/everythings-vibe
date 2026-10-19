"use client";

import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { DesignInspectorModel } from "@/features/scrape/utils/design-md-inspector";
import {
	GuidelineList,
	LimitationList,
} from "./design-system-inspector-guidelines";
import {
	groupPaletteColors,
	PaletteGroupSection,
} from "./design-system-inspector-palette";
import {
	InspectorSection,
	themeLabel,
} from "./design-system-inspector-sections";
import { RadiusRow, SpacingRow } from "./design-system-inspector-spacing";
import {
	ComponentPatternList,
	ElevationList,
	SurfaceList,
} from "./design-system-inspector-surfaces";
import { TypeSpecimenRow } from "./design-system-inspector-type-scale";
import { TypefaceCard } from "./design-system-inspector-typeface";

export interface DesignSystemInspectorProps {
	siteName: string;
	sourceUrl: string;
	model: DesignInspectorModel;
}

export type {
	PaletteGroup,
	PaletteGroupKey,
} from "./design-system-inspector-palette";
export {
	classifyPaletteGroup,
	groupPaletteColors,
} from "./design-system-inspector-palette";

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
			<div id="overview" className="scroll-mt-24">
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
				<details className="rounded-lg border border-graphite px-3 py-2">
					<summary className="cursor-pointer text-xs font-medium text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo">
						Tentang analisis
					</summary>
					<p className="mt-1.5 flex items-start gap-2 text-xs leading-5 text-fog">
						{model.verification === "observed" ? (
							<Icon
								icon={InformationCircleIcon}
								size={14}
								aria-hidden
								className="mt-0.5 shrink-0"
							/>
						) : (
							<Icon
								icon={Alert02Icon}
								size={14}
								aria-hidden
								className="mt-0.5 shrink-0"
							/>
						)}
						<span>
							{model.verification === "observed"
								? "Analisis berdasarkan tampilan website yang berhasil diperiksa."
								: "Hasil lama belum terverifikasi terhadap evidence browser. Nilai di bawah adalah hasil parsing dokumen arsip, bukan pengukuran."}
						</span>
					</p>
				</details>

				{model.colors.length > 0 ? (
					<InspectorSection
						id="colors"
						label="Palet Warna"
						description="Warna dikelompokkan dari peran yang terukur."
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
						id="typography"
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
						id="typeface"
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
						id="spacing"
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
									<div
										aria-hidden="true"
										className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 font-mono text-[11px] tracking-wider text-slate uppercase"
									>
										<span>Tujuan</span>
										<span className="w-8 text-right sm:w-[180px]">Visual</span>
									</div>
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
						id="surfaces"
						label="Surface"
						description="Lapisan latar yang terukur, dari kanvas halaman ke permukaan yang lebih tinggi."
					>
						<SurfaceList surfaces={model.surfaces} />
					</InspectorSection>
				) : null}

				{model.elevation.length > 0 ? (
					<InspectorSection
						id="elevation"
						label="Elevation"
						description="Shadow yang benar-benar terukur, beserta jumlah elemen yang memakainya."
					>
						<ElevationList tokens={model.elevation} />
					</InspectorSection>
				) : null}

				{model.components.length > 0 ? (
					<InspectorSection
						id="components"
						label="Pola Komponen"
						description="Pola antarmuka yang benar-benar terukur, bukan rekonstruksi kode."
					>
						<ComponentPatternList components={model.components} />
					</InspectorSection>
				) : null}

				{hasGuidance ? (
					<InspectorSection
						id="guidelines"
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
					<InspectorSection id="limitations" label="Keterbatasan Pengukuran">
						<LimitationList limitations={model.limitations} />
					</InspectorSection>
				) : null}
			</div>
		</div>
	);
}
