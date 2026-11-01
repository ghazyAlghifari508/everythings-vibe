import { Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";

interface StudioDesignThemePanelProps {
	activeThemeId: string | null;
	onSelectTheme: (presetId: string) => void;
}

// ponytail: custom miniature layout ceiling is 3 fixed presets, upgrade to silhouette registry if presets become dynamic
function WorkspaceSilhouette({
	preset,
}: {
	preset: (typeof STUDIO_DESIGN_PRESETS)[number];
}) {
	return (
		<div className="flex h-full w-full">
			{/* Sidebar */}
			<div
				className="flex w-1/4 flex-col justify-between border-r p-2"
				style={{
					borderColor: `${preset.colors[1]}15`,
					backgroundColor: `${preset.colors[1]}05`,
				}}
			>
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-1.5 pb-1">
						<span
							className="size-2 rounded-xs"
							style={{ backgroundColor: preset.colors[2] }}
						/>
						<span
							className="h-1.5 w-8 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}80` }}
						/>
					</div>
					<div
						className="flex items-center gap-1 rounded-xs px-1 py-0.5"
						style={{ backgroundColor: `${preset.colors[2]}18` }}
					>
						<span
							className="size-1 rounded-full"
							style={{ backgroundColor: preset.colors[2] }}
						/>
						<span
							className="h-1 w-7 rounded-full"
							style={{ backgroundColor: preset.colors[2] }}
						/>
					</div>
					<div className="flex items-center gap-1 px-1 py-0.5">
						<span
							className="h-1 w-6 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}30` }}
						/>
					</div>
					<div className="flex items-center gap-1 px-1 py-0.5">
						<span
							className="h-1 w-5 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}30` }}
						/>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<span
						className="size-2 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}25` }}
					/>
					<span
						className="h-1 w-5 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}30` }}
					/>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex flex-1 flex-col justify-between p-2">
				{/* Header */}
				<div
					className="flex items-center justify-between pb-1.5 border-b"
					style={{ borderColor: `${preset.colors[1]}10` }}
				>
					<span
						className="h-1.5 w-10 rounded-full"
						style={{ backgroundColor: preset.colors[1] }}
					/>
					<div className="flex items-center gap-1">
						<span
							className="h-2 w-10 rounded-xs"
							style={{ backgroundColor: `${preset.colors[1]}10` }}
						/>
						<span
							className="size-2 rounded-full"
							style={{ backgroundColor: preset.colors[2] }}
						/>
					</div>
				</div>

				{/* Metrics KPI row */}
				<div className="grid grid-cols-2 gap-1.5 my-1">
					<div
						className="flex flex-col gap-0.5 rounded-xs p-1 border"
						style={{
							borderColor: `${preset.colors[1]}12`,
							backgroundColor: `${preset.colors[1]}03`,
						}}
					>
						<span
							className="h-1 w-6 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}40` }}
						/>
						<div className="flex items-baseline justify-between mt-0.5">
							<span
								className="h-2 w-8 rounded-xs"
								style={{ backgroundColor: preset.colors[1] }}
							/>
							<span
								className="size-1 rounded-full"
								style={{ backgroundColor: preset.colors[2] }}
							/>
						</div>
					</div>
					<div
						className="flex flex-col gap-0.5 rounded-xs p-1 border"
						style={{
							borderColor: `${preset.colors[1]}12`,
							backgroundColor: `${preset.colors[1]}03`,
						}}
					>
						<span
							className="h-1 w-6 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}40` }}
						/>
						<div className="flex items-baseline justify-between mt-0.5">
							<span
								className="h-2 w-7 rounded-xs"
								style={{ backgroundColor: preset.colors[1] }}
							/>
							<span
								className="h-1 w-3 rounded-full"
								style={{ backgroundColor: `${preset.colors[1]}30` }}
							/>
						</div>
					</div>
				</div>

				{/* Chart Area */}
				<div
					className="flex h-7 items-end gap-1 rounded-xs p-1 border"
					style={{
						borderColor: `${preset.colors[1]}10`,
						backgroundColor: `${preset.colors[1]}03`,
					}}
				>
					<span
						className="w-full rounded-xs"
						style={{ height: "35%", backgroundColor: `${preset.colors[1]}25` }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "60%", backgroundColor: `${preset.colors[1]}25` }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "45%", backgroundColor: `${preset.colors[1]}25` }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "85%", backgroundColor: preset.colors[2] }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "70%", backgroundColor: `${preset.colors[1]}25` }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "100%", backgroundColor: preset.colors[2] }}
					/>
					<span
						className="w-full rounded-xs"
						style={{ height: "55%", backgroundColor: `${preset.colors[1]}25` }}
					/>
				</div>

				{/* Table / items data row */}
				<div className="flex flex-col gap-1 mt-1">
					<div
						className="flex items-center justify-between rounded-xs px-1 py-0.5"
						style={{ backgroundColor: `${preset.colors[1]}06` }}
					>
						<span
							className="h-1 w-12 rounded-full"
							style={{ backgroundColor: preset.colors[1] }}
						/>
						<span
							className="h-1 w-5 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}40` }}
						/>
					</div>
					<div
						className="flex items-center justify-between rounded-xs px-1 py-0.5"
						style={{ backgroundColor: `${preset.colors[1]}04` }}
					>
						<span
							className="h-1 w-9 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}60` }}
						/>
						<span
							className="h-1 w-4 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}30` }}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function EditorialSilhouette({
	preset,
}: {
	preset: (typeof STUDIO_DESIGN_PRESETS)[number];
}) {
	return (
		<div className="flex h-full w-full flex-col justify-between p-2.5">
			{/* Top Masthead */}
			<div
				className="flex items-center justify-between pb-1.5 border-b"
				style={{ borderColor: `${preset.colors[1]}15` }}
			>
				<div className="flex items-center gap-1">
					<span
						className="size-1.5 rounded-xs"
						style={{ backgroundColor: preset.colors[2] }}
					/>
					<span
						className="h-1 w-10 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}60` }}
					/>
				</div>
				<span
					className="h-2 w-16 rounded-xs"
					style={{ backgroundColor: preset.colors[1] }}
				/>
				<span
					className="h-1 w-6 rounded-full"
					style={{ backgroundColor: `${preset.colors[1]}40` }}
				/>
			</div>

			{/* Category kicker */}
			<div className="flex items-center gap-1.5 pt-1">
				<span
					className="h-1.5 w-8 rounded-xs"
					style={{ backgroundColor: preset.colors[2] }}
				/>
				<span
					className="h-1 w-12 rounded-full"
					style={{ backgroundColor: `${preset.colors[1]}35` }}
				/>
			</div>

			{/* Serif headline hierarchy */}
			<div className="flex flex-col gap-1 py-0.5">
				<span
					className="h-2.5 w-5/6 rounded-xs"
					style={{ backgroundColor: preset.colors[1] }}
				/>
				<span
					className="h-2.5 w-3/5 rounded-xs"
					style={{ backgroundColor: preset.colors[1] }}
				/>
			</div>

			{/* Body text & editorial accent column */}
			<div className="grid grid-cols-3 gap-2 py-0.5">
				<div className="col-span-2 flex flex-col gap-1">
					<span
						className="h-1 w-full rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}50` }}
					/>
					<span
						className="h-1 w-11/12 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}50` }}
					/>
					<span
						className="h-1 w-4/5 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}50` }}
					/>
					<div
						className="flex flex-col gap-0.5 pl-1.5 border-l-2 my-0.5"
						style={{ borderColor: preset.colors[2] }}
					>
						<span
							className="h-1 w-full rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}75` }}
						/>
						<span
							className="h-1 w-3/4 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}75` }}
						/>
					</div>
				</div>

				<div
					className="col-span-1 flex flex-col justify-between rounded-xs p-1.5 border"
					style={{
						borderColor: `${preset.colors[1]}15`,
						backgroundColor: `${preset.colors[2]}0c`,
					}}
				>
					<div className="flex flex-col gap-1">
						<span
							className="h-1 w-6 rounded-xs"
							style={{ backgroundColor: preset.colors[2] }}
						/>
						<span
							className="h-6 w-full rounded-xs"
							style={{ backgroundColor: `${preset.colors[2]}18` }}
						/>
					</div>
					<span
						className="h-0.5 w-7 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}30` }}
					/>
				</div>
			</div>

			{/* Editorial folio */}
			<div
				className="flex items-center justify-between pt-1 border-t"
				style={{ borderColor: `${preset.colors[1]}10` }}
			>
				<span
					className="h-1 w-14 rounded-full"
					style={{ backgroundColor: `${preset.colors[1]}40` }}
				/>
				<span
					className="h-1 w-4 rounded-full"
					style={{ backgroundColor: `${preset.colors[1]}30` }}
				/>
			</div>
		</div>
	);
}

function MidnightSilhouette({
	preset,
}: {
	preset: (typeof STUDIO_DESIGN_PRESETS)[number];
}) {
	return (
		<div className="flex h-full w-full">
			{/* Dark Nav Rail */}
			<div
				className="flex w-9 flex-col items-center justify-between border-r py-2 px-1"
				style={{
					borderColor: "rgba(255,255,255,0.08)",
					backgroundColor: "rgba(255,255,255,0.02)",
				}}
			>
				<div className="flex flex-col items-center gap-1.5">
					<span
						className="size-2 rounded-full"
						style={{
							backgroundColor: preset.colors[2],
							boxShadow: `0 0 6px ${preset.colors[2]}80`,
						}}
					/>
					<div
						className="flex size-5 items-center justify-center rounded-sm"
						style={{ backgroundColor: `${preset.colors[2]}20` }}
					>
						<span
							className="size-1.5 rounded-full"
							style={{ backgroundColor: preset.colors[2] }}
						/>
					</div>
					<span
						className="size-1.5 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}20` }}
					/>
					<span
						className="size-1.5 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}20` }}
					/>
				</div>
				<span
					className="size-2 rounded-full border"
					style={{
						borderColor: `${preset.colors[1]}30`,
						backgroundColor: `${preset.colors[1]}10`,
					}}
				/>
			</div>

			{/* Main Dark Interface */}
			<div className="flex flex-1 flex-col justify-between p-2">
				{/* Top Header */}
				<div
					className="flex items-center justify-between pb-1.5 border-b"
					style={{ borderColor: "rgba(255,255,255,0.08)" }}
				>
					<div className="flex items-center gap-1.5">
						<span
							className="h-1.5 w-12 rounded-full"
							style={{ backgroundColor: preset.colors[1] }}
						/>
						<span
							className="h-1.5 w-5 rounded-full"
							style={{ backgroundColor: `${preset.colors[2]}80` }}
						/>
					</div>
					<div
						className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 border"
						style={{
							borderColor: "rgba(255,255,255,0.1)",
							backgroundColor: "rgba(255,255,255,0.04)",
						}}
					>
						<span
							className="size-1 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}40` }}
						/>
						<span
							className="h-1 w-8 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}30` }}
						/>
					</div>
				</div>

				{/* Panels Grid */}
				<div className="grid grid-cols-3 gap-1.5 my-1">
					<div
						className="col-span-2 flex flex-col justify-between rounded-sm p-1.5 border"
						style={{
							borderColor: "rgba(255,255,255,0.08)",
							backgroundColor: "rgba(255,255,255,0.03)",
						}}
					>
						<div className="flex items-center justify-between mb-1">
							<span
								className="h-1 w-10 rounded-full"
								style={{ backgroundColor: preset.colors[1] }}
							/>
							<span
								className="size-1 rounded-full"
								style={{ backgroundColor: preset.colors[2] }}
							/>
						</div>
						<div className="flex flex-col gap-0.5">
							<span
								className="h-1 w-full rounded-full"
								style={{ backgroundColor: `${preset.colors[2]}50` }}
							/>
							<span
								className="h-1 w-4/5 rounded-full"
								style={{ backgroundColor: `${preset.colors[1]}30` }}
							/>
							<span
								className="h-1 w-3/5 rounded-full"
								style={{ backgroundColor: `${preset.colors[1]}20` }}
							/>
						</div>
					</div>

					<div
						className="col-span-1 flex flex-col justify-between rounded-sm p-1.5 border"
						style={{
							borderColor: "rgba(255,255,255,0.08)",
							backgroundColor: "rgba(255,255,255,0.03)",
						}}
					>
						<span
							className="h-1 w-5 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}40` }}
						/>
						<div className="my-0.5">
							<span
								className="block h-2 w-8 rounded-xs"
								style={{ backgroundColor: preset.colors[2] }}
							/>
						</div>
						<div
							className="h-1 w-full rounded-full overflow-hidden"
							style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
						>
							<div
								className="h-full rounded-full"
								style={{ width: "70%", backgroundColor: preset.colors[2] }}
							/>
						</div>
					</div>
				</div>

				{/* Bottom Status Bar */}
				<div
					className="flex items-center justify-between rounded-sm px-1.5 py-0.5 border"
					style={{
						borderColor: "rgba(255,255,255,0.06)",
						backgroundColor: "rgba(255,255,255,0.02)",
					}}
				>
					<div className="flex items-center gap-1">
						<span
							className="size-1 rounded-full"
							style={{ backgroundColor: preset.colors[2] }}
						/>
						<span
							className="h-1 w-14 rounded-full"
							style={{ backgroundColor: `${preset.colors[1]}50` }}
						/>
					</div>
					<span
						className="h-1 w-6 rounded-full"
						style={{ backgroundColor: `${preset.colors[1]}25` }}
					/>
				</div>
			</div>
		</div>
	);
}

function ThemeSilhouette({
	preset,
}: {
	preset: (typeof STUDIO_DESIGN_PRESETS)[number];
}) {
	return (
		<div
			className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-graphite/40"
			style={{ backgroundColor: preset.colors[0] }}
			aria-hidden="true"
		>
			{preset.id === "workspace" && <WorkspaceSilhouette preset={preset} />}
			{preset.id === "editorial" && <EditorialSilhouette preset={preset} />}
			{preset.id === "midnight" && <MidnightSilhouette preset={preset} />}
		</div>
	);
}

/** Curated theme grid; selecting only stages a pending theme id. */
export function StudioDesignThemePanel({
	activeThemeId,
	onSelectTheme,
}: StudioDesignThemePanelProps) {
	return (
		<div role="tabpanel" aria-label="Tema" className="flex flex-col gap-3">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{STUDIO_DESIGN_PRESETS.map((preset) => {
					const selected = activeThemeId === preset.id;
					return (
						<button
							key={preset.id}
							type="button"
							aria-pressed={selected}
							onClick={() => onSelectTheme(preset.id)}
							className={`flex flex-col gap-2.5 rounded-xl border bg-onyx p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								selected
									? "border-snow/60 shadow-xs"
									: "border-graphite hover:border-steel"
							}`}
						>
							<ThemeSilhouette preset={preset} />
							<span className="flex items-center gap-1.5">
								<span className="flex gap-1" aria-hidden>
									{preset.colors.map((color) => (
										<span
											key={color}
											className="size-3.5 rounded-full border border-white/20"
											style={{ backgroundColor: color }}
										/>
									))}
								</span>
								<span className="text-sm font-semibold text-snow">
									{preset.name}
								</span>
								{selected ? (
									<Icon
										icon={Tick01Icon}
										size={14}
										aria-label="Terpilih"
										className="ml-auto text-snow"
									/>
								) : null}
							</span>
							<span className="text-xs text-fog">
								{preset.description} · {preset.font}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

const TEMPLATE_PLACEHOLDERS = [
	{
		id: "dashboard",
		name: "Dashboard",
		description: "Metrik, grafik, dan tabel operasional",
	},
	{
		id: "mobile-ecommerce",
		name: "Mobile E-commerce",
		description: "Katalog, keranjang, dan checkout",
	},
	{
		id: "saas-analytics",
		name: "SaaS Analytics",
		description: "MRR, churn, dan laporan pelanggan",
	},
	{
		id: "portfolio",
		name: "Portfolio",
		description: "Galeri karya dan studi kasus",
	},
	{
		id: "booking",
		name: "Booking Interface",
		description: "Pencarian, jadwal, dan pembayaran",
	},
	{
		id: "mobile-finance",
		name: "Mobile Finance",
		description: "Anggaran, transaksi, dan laporan",
	},
] as const;

/** Template catalogue is not shipped yet; every entry is an honest preview. */
export function StudioDesignTemplatePanel() {
	return (
		<div role="tabpanel" aria-label="Template" className="flex flex-col gap-3">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{TEMPLATE_PLACEHOLDERS.map((template) => (
					<div
						key={template.id}
						className="flex flex-col gap-1.5 rounded-xl border border-graphite bg-onyx p-3.5 opacity-80"
					>
						<span className="flex items-center gap-2">
							<span className="text-sm font-semibold text-snow">
								{template.name}
							</span>
							<span className="rounded-full border border-graphite px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fog">
								Segera hadir
							</span>
						</span>
						<span className="text-xs text-fog">{template.description}</span>
						<button
							type="button"
							disabled
							aria-disabled="true"
							title="Katalog template belum tersedia"
							className="mt-1 inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-graphite px-3 text-xs font-semibold text-fog opacity-60"
						>
							Pratinjau
						</button>
					</div>
				))}
			</div>
			<p className="text-xs text-fog">
				Katalog template belum tersedia. Opsi ini hanya pratinjau dan tidak
				mempengaruhi generate.
			</p>
		</div>
	);
}
