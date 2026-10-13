import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrapeFormNotice({ className }: { className?: string }) {
	return (
		<p
			className={cn(
				"flex items-start gap-2 rounded-lg border border-graphite bg-charcoal p-3 text-xs leading-5 text-fog",
				className,
			)}
		>
			<Info size={16} aria-hidden className="mt-0.5 shrink-0" />
			<span>
				<span className="block font-semibold text-snow">
					Tidak semua website dapat di-scrape
				</span>
				<span className="mt-0.5 block">
					Beberapa situs membatasi akses otomatis atau memerlukan login.
				</span>
			</span>
		</p>
	);
}
