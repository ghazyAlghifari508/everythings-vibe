import * as DialogPrimitive from "@radix-ui/react-dialog";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	AlertCircle,
	Check,
	FolderOpen,
	Loader2,
	Monitor,
	Palette,
	Smartphone,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	type AttachedDesignReference,
	StartWithDesignModal,
} from "@/components/design/start-with-design-modal";
import {
	type StudioHistoryItem,
	StudioSidebar,
} from "@/components/design/studio-sidebar";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import type { StudioDesignMode } from "@/lib/prompts-ui-studio";
import { requireUserServer } from "@/lib/session";

const loadStudioHistory = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ history: StudioHistoryItem[] }> => {
		const user = await requireUserServer();
		const { listStudioProjects } = await import(
			"@/lib/services/studio-service"
		);
		const rows = await listStudioProjects(user.id);
		return {
			history: rows.map((row) => ({
				id: row.id,
				title: row.title,
				designMode: row.designMode,
				hasDesignMd: Boolean(row.designMd),
				hasLogo: Boolean(row.logoAssetId),
				createdAt: row.createdAt.toISOString(),
			})),
		};
	},
);

export const studioSearchSchema = z.object({
	prompt: z.string().optional(),
});

export const Route = createFileRoute("/design/studio/")({
	head: () => ({
		meta: [{ title: "Prompt UI Studio | VibeDesign" }],
	}),
	validateSearch: (search) => studioSearchSchema.parse(search),
	loader: async () => loadStudioHistory(),
	component: StudioPage,
});

function StudioPage() {
	const { history } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate();

	const [prompt, setPrompt] = useState(search.prompt ?? "");
	const [designMode, setDesignMode] = useState<StudioDesignMode>("web");
	const [attachedReference, setAttachedReference] =
		useState<AttachedDesignReference | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (search.prompt !== undefined) setPrompt(search.prompt);
	}, [search.prompt]);

	const handleOpenProject = (id: string) => {
		setIsMobileDrawerOpen(false);
		void navigate({
			to: "/design/studio/$id",
			params: { id },
		});
	};

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!prompt.trim()) {
			setError("Ceritakan UI yang mau dibuat dulu.");
			textareaRef.current?.focus();
			return;
		}
		setLoading(true);
		setError("");
		try {
			const res = await fetch("/api/studio/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: prompt.trim(),
					designMode,
					designMd: attachedReference?.designMd ?? null,
					logo: attachedReference?.logo
						? {
								filename: attachedReference.logo.filename,
								mimeType: attachedReference.logo.mimeType,
								data: attachedReference.logo.data,
							}
						: null,
				}),
			});
			const data = (await res.json().catch(() => null)) as {
				projectId?: string;
				error?: string;
			} | null;
			if (!res.ok || !data?.projectId) {
				setError(data?.error ?? "Studio gagal generate. Coba lagi.");
				return;
			}
			void navigate({
				to: "/design/studio/$id",
				params: { id: data.projectId },
			});
		} catch {
			setError("Jaringan bermasalah. Coba lagi sebentar lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-onyx text-snow">
			{/* Desktop Left Sidebar: Real Project History */}
			<StudioSidebar
				history={history}
				onSelectProject={handleOpenProject}
				className="hidden md:flex w-72 lg:w-80 shrink-0 h-full"
			/>

			{/* Mobile / Tablet Collapsible Slide-over Drawer */}
			<DialogPrimitive.Root
				open={isMobileDrawerOpen}
				onOpenChange={setIsMobileDrawerOpen}
			>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs transition-opacity data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
					<DialogPrimitive.Content
						className="fixed inset-y-0 left-0 z-50 flex h-full w-80 max-w-[85vw] flex-col border-r border-graphite bg-charcoal text-snow shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left md:hidden"
						aria-describedby="mobile-drawer-desc"
					>
						<DialogPrimitive.Title className="sr-only">
							Riwayat Project Studio
						</DialogPrimitive.Title>
						<DialogPrimitive.Description
							id="mobile-drawer-desc"
							className="sr-only"
						>
							Daftar project studio kamu yang tersimpan
						</DialogPrimitive.Description>
						<div className="flex items-center justify-between border-b border-graphite px-4 py-3 bg-charcoal">
							<span className="text-xs font-semibold uppercase tracking-wider text-snow">
								My Projects
							</span>
							<DialogPrimitive.Close
								aria-label="Tutup riwayat"
								className="rounded-md p-1 text-fog hover:text-snow"
							>
								<X size={16} aria-hidden />
							</DialogPrimitive.Close>
						</div>
						<div className="flex-1 overflow-hidden">
							<StudioSidebar
								history={history}
								onSelectProject={handleOpenProject}
								className="border-0 h-full w-full"
							/>
						</div>
					</DialogPrimitive.Content>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>

			{/* Main AI Creative Workspace Center */}
			<main className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 sm:py-12 md:px-12 flex flex-col items-center justify-center">
				<div className="w-full max-w-3xl flex flex-col gap-6">
					{/* Mobile project drawer trigger & breadcrumb */}
					<div className="flex items-center justify-between gap-3 w-full">
						<HubBreadcrumb current="Prompt UI Studio" />
						<button
							type="button"
							onClick={() => setIsMobileDrawerOpen(true)}
							className="inline-flex md:hidden items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow hover:bg-onyx transition-colors"
						>
							<FolderOpen size={14} className="text-fog" aria-hidden />
							<span>Project ({history.length})</span>
						</button>
					</div>

					{/* Center Workspace Heading */}
					<header className="text-center sm:text-left space-y-2">
						<h1 className="text-3xl font-bold tracking-tight text-snow sm:text-4xl lg:text-5xl">
							What will you design?
						</h1>
						<p className="text-sm leading-6 text-fog max-w-2xl">
							Jelaskan antarmuka yang ingin kamu buat dalam Bahasa Indonesia.
							Studio menghasilkan halaman HTML interaktif lengkap dengan
							Tailwind dan data realistis.
						</p>
					</header>

					{/* Main AI Prompt Composer Surface */}
					<form
						onSubmit={(e) => void submit(e)}
						className="group flex flex-col gap-3 rounded-2xl border border-graphite bg-charcoal p-4 sm:p-5 shadow-lg transition-all focus-within:border-steel focus-within:ring-2 focus-within:ring-indigo/40"
					>
						<label
							htmlFor="studio-prompt"
							className="block cursor-text space-y-1.5"
						>
							<span className="sr-only">Prompt Desain UI</span>
							<textarea
								ref={textareaRef}
								id="studio-prompt"
								value={prompt}
								onChange={(e) => {
									setPrompt(e.target.value);
									if (error) setError("");
								}}
								placeholder="Jelaskan kebutuhan antarmukamu... Contoh: Dashboard analitik penjualan dengan kartu metrik ringkasan, grafik tren bulanan, dan tabel transaksi terkini dengan filter status..."
								rows={5}
								disabled={loading}
								className="w-full resize-none bg-transparent font-sans text-sm sm:text-base leading-relaxed text-snow placeholder:text-fog focus:outline-none disabled:opacity-50"
							/>
						</label>

						{/* Composer Bottom Toolbar: Mode Toggle & Action Button */}
						<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-graphite/60">
							{/* Segmented Web / Mobile Toggle */}
							<fieldset
								aria-label="Pilih mode desain antarmuka"
								className="m-0 flex items-center gap-1 rounded-xl border border-graphite bg-onyx p-1"
							>
								<button
									type="button"
									aria-pressed={designMode === "web"}
									onClick={() => setDesignMode("web")}
									disabled={loading}
									className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
										designMode === "web"
											? "bg-charcoal text-snow shadow-xs border border-graphite/80"
											: "text-fog hover:text-mist"
									}`}
								>
									<Monitor size={14} aria-hidden />
									<span>Web</span>
								</button>
								<button
									type="button"
									aria-pressed={designMode === "mobile"}
									onClick={() => setDesignMode("mobile")}
									disabled={loading}
									className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
										designMode === "mobile"
											? "bg-charcoal text-snow shadow-xs border border-graphite/80"
											: "text-fog hover:text-mist"
									}`}
								>
									<Smartphone size={14} aria-hidden />
									<span>Mobile</span>
								</button>
							</fieldset>

							{/* Generate Submit Button */}
							<button
								type="submit"
								disabled={loading || !prompt.trim()}
								className="btn-primary inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2 text-xs sm:text-sm font-semibold transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{loading ? (
									<Loader2 size={16} aria-hidden className="animate-spin" />
								) : (
									<Sparkles size={16} aria-hidden />
								)}
								<span>{loading ? "Menggenerate UI..." : "Generate UI"}</span>
							</button>
						</div>
					</form>

					{/* Attached Design Reference Notice (if attached via modal) */}
					{attachedReference && (
						<div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-graphite bg-charcoal px-4 py-2.5 text-xs text-mist shadow-xs animate-in fade-in-0">
							<div className="flex items-center gap-2">
								<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
									<Check size={14} aria-hidden />
								</span>
								<span>
									<strong className="text-snow">Design reference aktif:</strong>{" "}
									DESIGN.md
									{attachedReference.logo ? (
										<span className="text-fog">
											{" "}
											· Logo ({attachedReference.logo.filename})
										</span>
									) : null}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setIsModalOpen(true)}
									className="text-xs font-semibold text-mist hover:text-snow underline underline-offset-2"
								>
									Edit Referensi
								</button>
								<button
									type="button"
									onClick={() => setAttachedReference(null)}
									aria-label="Lepas referensi desain"
									className="text-fog hover:text-red-400 p-1"
								>
									<Trash2 size={13} aria-hidden />
								</button>
							</div>
						</div>
					)}

					{/* Error Alert if any */}
					{error && (
						<div
							role="alert"
							className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-400"
						>
							<AlertCircle size={16} className="shrink-0" aria-hidden />
							<span>{error}</span>
						</div>
					)}

					{/* Prominent Secondary Action: Start with your design */}
					<div className="flex justify-center sm:justify-start">
						<button
							type="button"
							onClick={() => setIsModalOpen(true)}
							className="inline-flex items-center gap-2 rounded-full border border-graphite bg-charcoal px-5 py-2.5 text-xs sm:text-sm font-semibold text-mist hover:border-steel hover:bg-onyx hover:text-snow transition-all shadow-xs"
						>
							{attachedReference?.logo?.previewUrl ? (
								<img
									src={attachedReference.logo.previewUrl}
									alt=""
									className="size-4 object-contain rounded-xs"
								/>
							) : (
								<Palette size={15} className="text-fog" aria-hidden />
							)}
							<span>
								{attachedReference
									? "Ubah referensi design system & logo"
									: "Start with your design"}
							</span>
						</button>
					</div>
				</div>
			</main>

			{/* Fullscreen Design System Reference Modal */}
			<StartWithDesignModal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				initialReference={attachedReference}
				onApply={(reference) => {
					setAttachedReference(reference);
					textareaRef.current?.focus();
				}}
			/>
		</div>
	);
}
