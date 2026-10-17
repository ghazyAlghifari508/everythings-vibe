"use client";

import { Check, FileCode2, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { STUDIO_LOGO_MAX_BYTES } from "@/lib/constants";
import { validateStudioDesignMd } from "@/lib/prompts-ui-studio";
import { extractDesignSystemTokens } from "@/lib/studio-design-system";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/lib/studio-presets";
import type { AttachedLogo } from "./start-with-design-modal";

export type DesignPickerTab = "tema" | "template" | "milik";

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

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Visual design picker: curated themes, coming-soon templates, and a compact
// custom DESIGN.md upload. Selecting never generates; the parent stages the
// reference and only sends it on explicit submit.
export function StudioDesignPickerDialog({
	open,
	onOpenChange,
	selectedThemeId,
	customFilename,
	onSelectTheme,
	onSelectCustom,
	onClear,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedThemeId: string | null;
	customFilename: string | null;
	onSelectTheme: (presetId: string) => void;
	onSelectCustom: (input: {
		filename: string;
		designMd: string;
		logo: AttachedLogo | null;
	}) => void;
	onClear: () => void;
}) {
	const [tab, setTab] = useState<DesignPickerTab>("tema");
	const [pendingThemeId, setPendingThemeId] = useState<string | null>(null);
	const [mdName, setMdName] = useState<string | null>(null);
	const [mdText, setMdText] = useState("");
	const [mdError, setMdError] = useState<string | null>(null);
	const [reading, setReading] = useState(false);
	const [logo, setLogo] = useState<AttachedLogo | null>(null);
	const [logoError, setLogoError] = useState<string | null>(null);
	const mdInputRef = useRef<HTMLInputElement>(null);
	const logoInputRef = useRef<HTMLInputElement>(null);

	const activeThemeId = pendingThemeId ?? selectedThemeId;
	const activeTheme = STUDIO_DESIGN_PRESETS.find(
		(preset) => preset.id === activeThemeId,
	);
	const customTokens = mdText ? extractDesignSystemTokens(mdText) : null;
	const customValid =
		mdName !== null && mdError === null && mdText.trim().length >= 20;
	const colorCount = customTokens
		? [
				customTokens.colors.primary,
				customTokens.colors.canvas,
				customTokens.colors.ink,
				customTokens.colors.surface,
				customTokens.colors.muted,
				customTokens.colors.border,
			].filter(Boolean).length + Object.keys(customTokens.colors.accents).length
		: 0;

	async function handleMdFile(file: File | undefined) {
		if (!file) return;
		setMdError(null);
		if (!/\.(md|markdown)$/i.test(file.name)) {
			setMdError("Gunakan file berekstensi .md atau .markdown.");
			return;
		}
		if (file.size > 500 * 1024) {
			setMdError("Ukuran file .md melebihi batas 500 KB.");
			return;
		}
		setReading(true);
		try {
			const text = await file.text();
			const checked = validateStudioDesignMd(text);
			if (!checked.ok || !checked.designMd) {
				setMdError(
					!checked.ok ? checked.error : "File tidak berisi desain yang valid.",
				);
				return;
			}
			const tokens = extractDesignSystemTokens(checked.designMd);
			const foundColors = tokens
				? [
						tokens.colors.primary,
						tokens.colors.canvas,
						tokens.colors.ink,
						tokens.colors.surface,
						tokens.colors.muted,
						tokens.colors.border,
					].filter(Boolean).length + Object.keys(tokens.colors.accents).length
				: 0;
			if (!tokens || (!tokens.typography.fontFamily && foundColors === 0)) {
				setMdError(
					"File tidak memuat token desain yang dikenali (warna atau font).",
				);
				return;
			}
			setMdName(file.name);
			setMdText(checked.designMd);
		} catch {
			setMdError("Gagal membaca file. Coba lagi.");
		} finally {
			setReading(false);
		}
	}

	function handleLogoFile(file: File | undefined) {
		if (!file) return;
		setLogoError(null);
		if (!/^image\//.test(file.type || "")) {
			setLogoError("Logo harus berupa file gambar.");
			return;
		}
		if (file.size > STUDIO_LOGO_MAX_BYTES) {
			setLogoError(
				`Ukuran logo melebihi batas ${formatBytes(STUDIO_LOGO_MAX_BYTES)}.`,
			);
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const url = typeof reader.result === "string" ? reader.result : "";
			const data = url.includes(",") ? url.split(",").slice(1).join(",") : "";
			if (!data) {
				setLogoError("Gagal membaca logo. Coba file lain.");
				return;
			}
			setLogo({
				filename: file.name,
				mimeType: file.type || "image/png",
				data,
				byteLength: file.size,
			});
		};
		reader.onerror = () => setLogoError("Gagal membaca logo. Coba lagi.");
		reader.readAsDataURL(file);
	}

	function resetCustom() {
		setMdName(null);
		setMdText("");
		setMdError(null);
		setLogo(null);
		setLogoError(null);
	}

	const tabs: { id: DesignPickerTab; label: string }[] = [
		{ id: "tema", label: "Tema" },
		{ id: "template", label: "Template" },
		{ id: "milik", label: "Punya Saya" },
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="fixed inset-0 !inset-0 left-0 top-0 !left-0 !top-0 !translate-none !translate-x-0 !translate-y-0 w-screen h-dvh max-h-dvh max-w-none !m-0 rounded-none sm:rounded-none !rounded-none border-0 !border-0 shadow-none !shadow-none flex flex-col gap-0 !gap-0 overflow-hidden p-0 !p-0 bg-obsidian">
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
					<div
						className={`mx-auto flex w-full flex-col gap-6 ${
							tab === "milik" ? "max-w-2xl" : "max-w-4xl"
						}`}
					>
						<DialogHeader className="gap-1.5 text-left sm:text-left">
							<DialogTitle className="text-xl font-bold tracking-tight text-snow sm:text-2xl">
								Pilih tampilan
							</DialogTitle>
							<DialogDescription className="text-sm text-fog">
								Pilih referensi visual untuk proyek desainmu. Referensi
								tersimpan sebagai draf dan baru dipakai saat kamu menekan kirim.
							</DialogDescription>
						</DialogHeader>

						<div className="flex justify-center">
							<div
								role="tablist"
								aria-label="Sumber referensi desain"
								className="inline-flex items-center gap-1 rounded-xl border border-graphite bg-onyx p-1"
							>
								{tabs.map((entry) => (
									<button
										key={entry.id}
										type="button"
										role="tab"
										aria-selected={tab === entry.id}
										onClick={() => setTab(entry.id)}
										onKeyDown={(e) => {
											if (e.key === "ArrowRight") {
												const nextIdx =
													(tabs.findIndex((t) => t.id === tab) + 1) %
													tabs.length;
												setTab(tabs[nextIdx].id);
											} else if (e.key === "ArrowLeft") {
												const prevIdx =
													(tabs.findIndex((t) => t.id === tab) -
														1 +
														tabs.length) %
													tabs.length;
												setTab(tabs[prevIdx].id);
											}
										}}
										className={`min-h-9 rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
											tab === entry.id
												? "bg-charcoal text-snow shadow-xs"
												: "text-fog hover:text-mist"
										}`}
									>
										{entry.label}
									</button>
								))}
							</div>
						</div>

						{tab === "tema" ? (
							<div
								role="tabpanel"
								aria-label="Tema"
								className="flex flex-col gap-3"
							>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{STUDIO_DESIGN_PRESETS.map((preset) => {
										const selected = activeThemeId === preset.id;
										return (
											<button
												key={preset.id}
												type="button"
												aria-pressed={selected}
												onClick={() => setPendingThemeId(preset.id)}
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
														<Check
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
						) : null}

						{tab === "template" ? (
							<div
								role="tabpanel"
								aria-label="Template"
								className="flex flex-col gap-3"
							>
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
											<span className="text-xs text-fog">
												{template.description}
											</span>
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
									Katalog template belum tersedia. Opsi ini hanya pratinjau dan
									tidak memengaruhi generate.
								</p>
							</div>
						) : null}

						{tab === "milik" ? (
							<div
								role="tabpanel"
								aria-label="Punya Saya"
								className="flex flex-col gap-3"
							>
								<div className="flex flex-col gap-2 rounded-xl border border-graphite bg-onyx p-3.5">
									<span className="flex items-center gap-2 text-sm font-semibold text-snow">
										<FileCode2 size={15} aria-hidden className="text-fog" />
										File DESIGN.md
									</span>
									{mdName ? (
										<span className="flex flex-wrap items-center gap-2 text-xs">
											<span className="max-w-56 truncate font-semibold text-snow">
												{mdName}
											</span>
											{customTokens ? (
												<span className="text-fog">
													{colorCount} warna
													{customTokens.typography.fontFamily
														? ` · ${customTokens.typography.fontFamily}`
														: ""}
												</span>
											) : null}
											<button
												type="button"
												onClick={() => mdInputRef.current?.click()}
												className="rounded px-1.5 py-0.5 font-semibold text-mist underline underline-offset-2 hover:text-snow"
											>
												Ganti
											</button>
											<button
												type="button"
												onClick={() => {
													setMdName(null);
													setMdText("");
													setMdError(null);
												}}
												aria-label="Hapus file desain"
												className="rounded p-1 text-fog hover:text-snow"
											>
												<X size={13} aria-hidden />
											</button>
										</span>
									) : (
										<button
											type="button"
											onClick={() => mdInputRef.current?.click()}
											disabled={reading}
											className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-graphite px-3 text-xs text-fog transition-colors hover:border-steel hover:text-mist disabled:opacity-50"
										>
											{reading ? (
												<Loader2
													size={16}
													aria-hidden
													className="motion-safe:animate-spin"
												/>
											) : (
												<Upload size={16} aria-hidden />
											)}
											<span>
												{reading
													? "Membaca file..."
													: "Pilih file .md (maks 500 KB)"}
											</span>
										</button>
									)}
									<input
										ref={mdInputRef}
										type="file"
										accept=".md,.markdown,text/markdown"
										aria-label="Unggah file DESIGN.md"
										className="sr-only"
										onChange={(event) => {
											void handleMdFile(event.target.files?.[0]);
											event.target.value = "";
										}}
									/>
									{mdError ? (
										<p role="alert" className="text-xs text-crimson">
											{mdError}
										</p>
									) : null}
								</div>

								<div className="flex flex-col gap-2 rounded-xl border border-graphite bg-onyx p-3.5">
									<span className="flex items-center gap-2 text-sm font-semibold text-snow">
										<ImageIcon size={15} aria-hidden className="text-fog" />
										Logo aplikasi
										<span className="text-xs font-normal text-fog">
											(opsional)
										</span>
									</span>
									{logo ? (
										<span className="flex flex-wrap items-center gap-2 text-xs">
											<span className="max-w-56 truncate font-semibold text-snow">
												{logo.filename}
											</span>
											<button
												type="button"
												onClick={() => setLogo(null)}
												aria-label="Hapus logo"
												className="rounded p-1 text-fog hover:text-snow"
											>
												<X size={13} aria-hidden />
											</button>
										</span>
									) : (
										<button
											type="button"
											onClick={() => logoInputRef.current?.click()}
											className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-graphite px-3 text-xs font-semibold text-mist transition-colors hover:text-snow"
										>
											<Upload size={14} aria-hidden />
											Pilih logo
										</button>
									)}
									<input
										ref={logoInputRef}
										type="file"
										accept="image/*"
										aria-label="Unggah logo aplikasi"
										className="sr-only"
										onChange={(event) => {
											handleLogoFile(event.target.files?.[0]);
											event.target.value = "";
										}}
									/>
									{logoError ? (
										<p role="alert" className="text-xs text-crimson">
											{logoError}
										</p>
									) : null}
								</div>
							</div>
						) : null}

						<DialogFooter className="mt-4 flex flex-row items-center justify-between gap-2 border-t border-graphite/40 pt-4 sm:flex-row sm:justify-between">
							{selectedThemeId || customFilename ? (
								<button
									type="button"
									onClick={() => {
										resetCustom();
										onClear();
										onOpenChange(false);
									}}
									className="rounded-lg px-3 py-2 text-xs font-semibold text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Lepas referensi
								</button>
							) : (
								<span />
							)}
							<span className="flex items-center gap-2">
								<span className="mr-2 hidden text-xs text-fog sm:inline">
									Referensi terpilih:{" "}
									<span className="font-semibold text-mist">
										{activeTheme
											? activeTheme.name
											: (customFilename ?? "belum ada")}
									</span>
								</span>
								<Button
									type="button"
									variant="secondary"
									onClick={() => onOpenChange(false)}
								>
									Batal
								</Button>
								{tab === "tema" ? (
									<Button
										type="button"
										disabled={!activeThemeId}
										onClick={() => {
											if (!activeThemeId) return;
											const md = getStudioPresetDesignMd(activeThemeId);
											if (!md) return;
											onSelectTheme(activeThemeId);
											setPendingThemeId(null);
											onOpenChange(false);
										}}
									>
										Gunakan Tema
									</Button>
								) : null}
								{tab === "milik" ? (
									<Button
										type="button"
										disabled={!customValid}
										onClick={() => {
											if (!customValid || !mdName) return;
											onSelectCustom({
												filename: mdName,
												designMd: mdText,
												logo,
											});
											resetCustom();
											onOpenChange(false);
										}}
									>
										Gunakan Desain Ini
									</Button>
								) : null}
							</span>
						</DialogFooter>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
