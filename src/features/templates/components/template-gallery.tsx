"use client";
import { TEMPLATE_GALLERY } from "../data/gallery-templates";
export function TemplateGallery({
	onSelect,
}: {
	onSelect: (prompt: string, platform: "web" | "mobile") => void;
}) {
	return (
		<div className="mx-auto mt-8 grid max-w-[728px] grid-cols-2 gap-3 md:grid-cols-3">
			{TEMPLATE_GALLERY.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => onSelect(t.prompt, t.platform)}
					className="rounded-xl border border-graphite bg-charcoal p-4 text-left hover:border-fog/40 transition"
				>
					<div className="text-sm font-[510] text-snow">{t.title}</div>
					<div className="mt-1 text-xs text-fog capitalize">
						{t.platform} App
					</div>
				</button>
			))}
		</div>
	);
}
