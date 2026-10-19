import { Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";

interface StudioDesignThemePanelProps {
	activeThemeId: string | null;
	onSelectTheme: (presetId: string) => void;
}

/** Curated theme grid; selecting only stages a pending theme id. */
export function StudioDesignThemePanel({
	activeThemeId,
	onSelectTheme,
}: StudioDesignThemePanelProps) {
	const activeTheme = STUDIO_DESIGN_PRESETS.find(
		(preset) => preset.id === activeThemeId,
	);
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
									? "border-snow/60"
									: "border-graphite hover:border-steel"
							}`}
						>
							<span
								className="flex h-16 items-stretch gap-1.5 overflow-hidden rounded-lg"
								aria-hidden
							>
								<span
									className="flex w-14 flex-col justify-end p-1.5"
									style={{ backgroundColor: preset.colors[0] }}
								>
									<span
										className="block h-1.5 w-8 rounded-full"
										style={{ backgroundColor: preset.colors[2] }}
									/>
									<span
										className="mt-1 block h-1 w-10 rounded-full"
										style={{ backgroundColor: preset.colors[1] }}
									/>
								</span>
								<span
									className="flex flex-1 flex-col gap-1 p-1.5"
									style={{ backgroundColor: preset.colors[0] }}
								>
									<span
										className="block h-4 rounded"
										style={{
											backgroundColor: preset.colors[1],
											opacity: 0.85,
										}}
									/>
									<span className="flex gap-1">
										<span
											className="block h-6 flex-1 rounded"
											style={{
												backgroundColor: preset.colors[1],
												opacity: 0.25,
											}}
										/>
										<span
											className="block h-6 flex-1 rounded"
											style={{ backgroundColor: preset.colors[2] }}
										/>
									</span>
								</span>
							</span>
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
			<output className="text-xs text-fog">
				Dipilih:{" "}
				<span className="font-semibold text-mist">
					{activeTheme ? activeTheme.name : "belum ada"}
				</span>
			</output>
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
