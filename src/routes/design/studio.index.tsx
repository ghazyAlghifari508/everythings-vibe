import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { FolderOpen, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
	type LaunchComposerConfig,
	StudioLaunchComposer,
} from "@/features/studio/components/composer/studio-launch-composer";
import type { AttachedDesignReference } from "@/features/studio/components/design-system/start-with-design-modal";
import { StudioDesignPickerDialog } from "@/features/studio/components/design-system/studio-design-picker-dialog";
import { StudioShortcutCarousel } from "@/features/studio/components/studio-shortcut-carousel";
import { StudioBackLink } from "@/features/studio/components/workspace/studio-back-link";
import {
	type StudioHistoryItem,
	StudioSidebar,
} from "@/features/studio/components/workspace/studio-sidebar";
import { authClient } from "@/lib/auth-client";
import { requireUserServer } from "@/lib/session";
import {
	STUDIO_DEFAULT_PAGE_COUNT,
	type StudioDesignSkillId,
} from "@/lib/studio-generation-options";
import {
	getStudioPresetDesignMd,
	STUDIO_DESIGN_PRESETS,
} from "@/lib/studio-presets";
import {
	STUDIO_PROMPT_SHORTCUTS,
	type StudioPromptShortcut,
} from "@/lib/studio-prompt-shortcuts";
import { useUIStore } from "@/store";

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
	from: z.string().optional(),
});

export const Route = createFileRoute("/design/studio/")({
	head: () => ({
		meta: [{ title: "Prompt UI Studio | VibeDesign" }],
	}),
	validateSearch: (search) => studioSearchSchema.parse(search),
	loader: async () => {
		try {
			return await loadStudioHistory();
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: StudioPage,
});

type StagedReference =
	| { kind: "theme"; id: string; designMd: string }
	| {
			kind: "custom";
			filename: string;
			designMd: string;
			logo: AttachedDesignReference["logo"];
	  };

function StudioLandingProfile() {
	const { data: session } = authClient.useSession();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Profil dan tampilan"
					title="Profil dan tampilan"
					className="flex size-9 items-center justify-center rounded-full border border-graphite bg-charcoal text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{session?.user.image ? (
						<img
							src={session.user.image}
							alt=""
							className="size-8 rounded-full"
						/>
					) : (
						<User size={16} aria-hidden />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{session?.user.name ?? "Akun"}</DropdownMenuLabel>
				<DropdownMenuItem asChild>
					<Link to="/settings">Pengaturan akun</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<div className="flex items-center justify-between gap-4 px-2 py-1 text-sm text-fog">
					<span>Tampilan workspace</span>
					<ThemeToggle />
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function StudioPage() {
	const { history } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);

	const [prompt, setPrompt] = useState(search.prompt ?? "");
	const [config, setConfig] = useState<LaunchComposerConfig>({
		designMode: "web",
		designSkillId: "none" satisfies StudioDesignSkillId,
		initialPageCount: STUDIO_DEFAULT_PAGE_COUNT,
	});
	const [stagedReference, setStagedReference] =
		useState<StagedReference | null>(null);
	const [stagedPrd, setStagedPrd] = useState<{
		filename: string;
		content: string;
	} | null>(null);
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
	const [selectedShortcutId, setSelectedShortcutId] = useState<string | null>(
		null,
	);
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

	// Deletion goes through the authoritative server action, then the loader is
	// revalidated so the list, the count badge, and the filter all reconcile
	// from persisted state instead of an optimistic guess.
	async function handleDeleteProject(id: string) {
		const response = await fetch("/api/studio/project", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "delete", projectId: id }),
		});
		if (!response.ok) {
			const body: unknown = await response.json().catch(() => null);
			throw new Error(
				typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
					? body.error
					: "Gagal menghapus project. Coba lagi.",
			);
		}
		await router.invalidate();
		showToast("Project dihapus.", "success");
	}

	function applyShortcut(shortcut: StudioPromptShortcut) {
		setPrompt(shortcut.prompt);
		setSelectedShortcutId(shortcut.id);
		setConfig((previous) => ({
			...previous,
			designMode: shortcut.designMode,
			initialPageCount: shortcut.initialPageCount,
		}));
		setError("");
		textareaRef.current?.focus();
	}

	function handleSelectTheme(presetId: string) {
		const designMd = getStudioPresetDesignMd(presetId);
		if (!designMd) {
			setError("Tema tidak tersedia. Pilih tema lain.");
			return;
		}
		setStagedReference({ kind: "theme", id: presetId, designMd });
		setError("");
		textareaRef.current?.focus();
	}

	function handleSelectCustom(input: {
		filename: string;
		designMd: string;
		logo: AttachedDesignReference["logo"];
	}) {
		setStagedReference({
			kind: "custom",
			filename: input.filename,
			designMd: input.designMd,
			logo: input.logo,
		});
		setError("");
		textareaRef.current?.focus();
	}

	const referenceLabel = stagedReference
		? stagedReference.kind === "theme"
			? (STUDIO_DESIGN_PRESETS.find(
					(preset) => preset.id === stagedReference.id,
				)?.name ?? "Tema")
			: stagedReference.filename
		: null;

	async function submit() {
		if (loading) return;
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
					designMode: config.designMode,
					designSkillId: config.designSkillId,
					initialPageCount: config.initialPageCount,
					designReference: stagedReference
						? stagedReference.kind === "theme"
							? { kind: "theme", id: stagedReference.id }
							: { kind: "custom", filename: stagedReference.filename }
						: null,
					designMd: stagedReference?.designMd ?? null,
					prdAttachment: stagedPrd
						? {
								filename: stagedPrd.filename,
								content: stagedPrd.content,
							}
						: null,
					logo:
						stagedReference?.kind === "custom" && stagedReference.logo
							? {
									filename: stagedReference.logo.filename,
									mimeType: stagedReference.logo.mimeType,
									data: stagedReference.logo.data,
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
			setError("Jaringan bermasalah. Draf tetap tersimpan, coba lagi.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-dvh w-full overflow-x-clip bg-onyx text-snow">
			<header className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<StudioBackLink from={search.from} />
					<Logo height={26} />
				</div>
				<div className="flex items-center gap-1.5">
					<StudioLandingProfile />
					<button
						type="button"
						onClick={() => setIsMobileDrawerOpen(true)}
						className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow transition-colors hover:bg-steel md:hidden"
					>
						<FolderOpen size={14} className="text-fog" aria-hidden />
						<span>Project ({history.length})</span>
					</button>
				</div>
			</header>

			<div className="flex w-full items-start gap-3 px-3 pb-6 md:gap-4 md:px-4">
				<StudioSidebar
					history={history}
					onSelectProject={handleOpenProject}
					onDeleteProject={handleDeleteProject}
					className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] w-72 shrink-0 overflow-hidden md:flex lg:w-80"
				/>

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
							<div className="flex items-center justify-between border-b border-graphite bg-charcoal px-4 py-3">
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
									onDeleteProject={handleDeleteProject}
									className="h-full w-full rounded-none border-0"
								/>
							</div>
						</DialogPrimitive.Content>
					</DialogPrimitive.Portal>
				</DialogPrimitive.Root>

				<main className="min-w-0 flex-1">
					<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-1 py-2 sm:px-2 md:py-6">
						<div className="space-y-2 text-center sm:text-left">
							<h1 className="text-3xl font-bold tracking-tight text-snow sm:text-4xl lg:text-5xl">
								What will you design?
							</h1>
							<p className="mx-auto max-w-2xl text-sm leading-6 text-fog sm:mx-0">
								Jelaskan antarmuka yang ingin kamu buat dalam Bahasa Indonesia.
								Studio menghasilkan halaman HTML interaktif lengkap dengan
								Tailwind dan data realistis.
							</p>
						</div>

						<StudioLaunchComposer
							prompt={prompt}
							onPromptChange={(value) => {
								setPrompt(value);
								setSelectedShortcutId(null);
								if (error) setError("");
							}}
							config={config}
							onConfigChange={(patch) =>
								setConfig((previous) => ({ ...previous, ...patch }))
							}
							reference={
								referenceLabel
									? {
											label: referenceLabel,
											logoFilename:
												stagedReference?.kind === "custom"
													? (stagedReference.logo?.filename ?? null)
													: null,
										}
									: null
							}
							onOpenDesignPicker={() => setIsPickerOpen(true)}
							onRemoveReference={() => setStagedReference(null)}
							prd={stagedPrd}
							onPrdChange={setStagedPrd}
							loading={loading}
							error={error}
							onError={setError}
							onSubmit={() => void submit()}
							textareaRef={textareaRef}
						/>

						<StudioShortcutCarousel
							shortcuts={STUDIO_PROMPT_SHORTCUTS}
							onSelect={applyShortcut}
							selectedId={selectedShortcutId}
						/>
					</div>
				</main>
			</div>

			<StudioDesignPickerDialog
				open={isPickerOpen}
				onOpenChange={setIsPickerOpen}
				selectedThemeId={
					stagedReference?.kind === "theme" ? stagedReference.id : null
				}
				customFilename={
					stagedReference?.kind === "custom" ? stagedReference.filename : null
				}
				onSelectTheme={handleSelectTheme}
				onSelectCustom={handleSelectCustom}
				onClear={() => setStagedReference(null)}
			/>
		</div>
	);
}
