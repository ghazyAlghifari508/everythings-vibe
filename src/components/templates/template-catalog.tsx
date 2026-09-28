import { useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	BarChart3,
	Bot,
	Building2,
	Check,
	Copy,
	CreditCard,
	GraduationCap,
	HeartPulse,
	Layers,
	LayoutDashboard,
	Receipt,
	Search,
	ShoppingBag,
	ShoppingCart,
	Smartphone,
	Sparkles,
	Store,
	Terminal,
	Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	searchTemplates,
	type TemplateCategory,
	type VibeTemplateEntry,
} from "@/lib/template-gallery";

const ICON_MAP: Record<string, typeof BarChart3> = {
	BarChart3,
	Store,
	Smartphone,
	GraduationCap,
	Users,
	Receipt,
	LayoutDashboard,
	HeartPulse,
	ShoppingBag,
	CreditCard,
	Terminal,
	Sparkles,
	Building2,
	Layers,
	ShoppingCart,
	Bot,
};

export function TemplateCatalog({
	onUseTemplate,
	onCopyPrompt,
}: {
	onUseTemplate?: (template: VibeTemplateEntry) => void;
	onCopyPrompt?: (prompt: string) => void;
}) {
	const navigate = useNavigate();
	const [activeCategory, setActiveCategory] = useState<
		TemplateCategory | "all"
	>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const filteredTemplates = useMemo(() => {
		return searchTemplates(searchQuery, activeCategory);
	}, [searchQuery, activeCategory]);

	const handleCopy = async (id: string, prompt: string) => {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopiedId(id);
			if (onCopyPrompt) onCopyPrompt(prompt);
			setTimeout(() => setCopiedId(null), 2000);
		} catch {
			// clipboard unavailable (e.g. insecure context); keep card state unchanged
		}
	};

	const handleNavigate = (template: VibeTemplateEntry) => {
		if (onUseTemplate) {
			onUseTemplate(template);
			return;
		}
		if (template.recommendedTarget === "/design/studio") {
			navigate({
				to: "/design/studio",
				search: { prompt: template.prompt },
			});
		} else {
			navigate({
				to: "/plan/new",
				search: {
					prompt: template.prompt,
					platform: template.platform,
				},
			});
		}
	};

	return (
		<div className="flex w-full flex-col gap-8">
			{/* Controls Toolbar: Categories and Search Bar */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				{/* Category Tabs */}
				<div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-graphite bg-charcoal p-1.5">
					{(
						[
							{ key: "all", label: "Semua" },
							{ key: "planning", label: "Planning" },
							{ key: "design", label: "Design" },
							{ key: "boilerplate", label: "Boilerplate" },
						] as const
					).map((tab) => (
						<button
							key={tab.key}
							type="button"
							onClick={() => setActiveCategory(tab.key)}
							className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
								activeCategory === tab.key
									? "bg-obsidian text-snow shadow-sm"
									: "text-fog hover:text-snow"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Search Filter */}
				<div className="relative w-full sm:w-72">
					<Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fog" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari template, tag, atau tech..."
						className="h-9.5 w-full rounded-xl border border-graphite bg-charcoal pl-9.5 pr-4 text-xs text-snow placeholder:text-fog focus:border-steel focus:outline-none"
					/>
				</div>
			</div>

			{/* Template Cards Grid */}
			{filteredTemplates.length === 0 ? (
				<div className="rounded-2xl border border-graphite bg-charcoal/50 p-12 text-center">
					<p className="text-sm text-fog">
						Tidak ada template yang cocok dengan pencarian kamu.
					</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{filteredTemplates.map((template) => {
						const IconComponent = ICON_MAP[template.icon] ?? Sparkles;
						const isCopied = copiedId === template.id;

						return (
							<div
								key={template.id}
								className="group flex flex-col justify-between rounded-2xl border border-graphite bg-charcoal p-6 transition-colors hover:border-steel"
							>
								<div className="flex flex-col gap-4">
									{/* Top Metadata Header */}
									<div className="flex items-start justify-between gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-graphite bg-obsidian text-snow">
											<IconComponent size={20} />
										</div>
										<div className="flex flex-wrap items-center gap-1.5">
											<span className="rounded-full border border-graphite bg-obsidian px-2.5 py-0.5 text-[10px] font-medium capitalize text-mist">
												{template.category}
											</span>
											<span className="rounded-full border border-graphite bg-obsidian px-2.5 py-0.5 text-[10px] font-medium capitalize text-fog">
												{template.platform}
											</span>
										</div>
									</div>

									{/* Title & Description */}
									<div>
										<h3 className="text-base font-semibold text-snow group-hover:text-mist transition-colors">
											{template.title}
										</h3>
										<p className="mt-2 line-clamp-3 text-xs leading-relaxed text-fog">
											{template.description}
										</p>
									</div>

									{/* Tech Stack Pills (if boilerplate) */}
									{template.techStack && (
										<div className="flex flex-wrap gap-1 pt-1">
											{template.techStack.map((tech) => (
												<span
													key={tech}
													className="rounded border border-graphite/60 bg-onyx/50 px-2 py-0.5 text-[10px] text-mist"
												>
													{tech}
												</span>
											))}
										</div>
									)}

									{/* Tag Pills */}
									<div className="flex flex-wrap gap-1.5 pt-1">
										{template.tags.slice(0, 3).map((tag) => (
											<span key={tag} className="text-[11px] text-fog/80">
												#{tag}
											</span>
										))}
									</div>
								</div>

								{/* Action Buttons */}
								<div className="mt-6 flex items-center gap-2 border-t border-graphite/40 pt-4">
									<button
										type="button"
										onClick={() => handleNavigate(template)}
										className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-graphite bg-obsidian px-3 py-2 text-xs font-semibold text-snow hover:border-steel hover:bg-white/5 transition"
									>
										<span>
											{template.category === "design"
												? "Rancang di Studio"
												: "Gunakan di VibePlan"}
										</span>
										<ArrowRight size={14} />
									</button>
									<button
										type="button"
										title="Salin Prompt"
										aria-label="Salin Prompt"
										onClick={() => handleCopy(template.id, template.prompt)}
										className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border border-graphite bg-obsidian text-fog hover:border-steel hover:text-snow transition"
									>
										{isCopied ? (
											<Check size={14} className="text-emerald-400" />
										) : (
											<Copy size={14} />
										)}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
