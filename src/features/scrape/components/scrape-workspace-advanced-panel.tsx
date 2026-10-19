import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode } from "@/db/schema";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import { cn } from "@/lib/utils";
import {
	type AdvancedParameterGroup,
	type AnyScrapeSettings,
	type NumericParameterSpec,
	type ToggleParameterSpec,
	URL_FILTER_SPEC,
} from "../types/parameter-spec";
import { fieldClass, ParameterGroup } from "./scrape-workspace-parameter-group";

const DISCLOSURE_HINTS: Record<ScrapeMode, string> = {
	design: "Tampilan, tema, dan isi panduan desain",
	crawl: "Cakupan crawl dan jenis data yang disimpan",
	html: "Cara halaman diambil sebelum disimpan",
	images: "Seberapa detail setiap gambar diperiksa",
};

// Controlled disclosure following the existing in-repo accordion pattern: a
// real button with aria-expanded, a rotating chevron and a focus ring, instead
// of a native <details> whose summary cannot carry a proper affordance.
export function ScrapeWorkspaceAdvancedPanel({
	mode,
	open,
	onToggle,
	panelId,
	groups,
	settings,
	issues,
	urlRegex,
	onUrlRegexChange,
	onNumberChange,
	onToggleChange,
	onSelectChange,
	onReset,
}: {
	mode: ScrapeMode;
	open: boolean;
	onToggle: () => void;
	panelId: string;
	groups: AdvancedParameterGroup[];
	settings: AnyScrapeSettings;
	issues: Record<string, string>;
	urlRegex: string;
	onUrlRegexChange: (value: string) => void;
	onNumberChange: (key: NumericParameterSpec["key"], value: number) => void;
	onToggleChange: (key: ToggleParameterSpec["key"], value: boolean) => void;
	onSelectChange: (key: string, value: string) => void;
	onReset: () => void;
}) {
	return (
		<div className="mt-5 min-w-0 rounded-lg border border-graphite">
			<h2 className="min-w-0">
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={open}
					aria-controls={panelId}
					className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span className="min-w-0">
						<span className="block text-sm font-semibold text-snow">
							Parameter lanjutan
						</span>
						<span className="mt-0.5 block text-xs text-fog">
							{DISCLOSURE_HINTS[mode]}
						</span>
					</span>
					<Icon
						icon={ArrowDown01Icon}
						size={18}
						aria-hidden
						className={cn(
							"shrink-0 text-fog transition-transform motion-reduce:transition-none",
							open && "rotate-180",
						)}
					/>
				</button>
			</h2>
			{open ? (
				<div
					id={panelId}
					className="flex min-w-0 flex-col gap-6 border-t border-graphite p-4"
				>
					{groups.map((group) => (
						<ParameterGroup
							key={group.key}
							group={group}
							settings={settings}
							issues={issues}
							onNumberChange={onNumberChange}
							onToggleChange={onToggleChange}
							onSelectChange={onSelectChange}
						/>
					))}
					{mode === "crawl" ? (
						<div className="min-w-0">
							<label
								htmlFor="crawl-url-regex"
								className="text-sm font-medium text-snow"
							>
								{URL_FILTER_SPEC.label}
							</label>
							<input
								id="crawl-url-regex"
								value={urlRegex}
								maxLength={SCRAPE_LIMITS.regexChars}
								onChange={(event) => onUrlRegexChange(event.target.value)}
								className={cn(fieldClass, "mt-1.5 font-mono")}
							/>
							<p className="mt-1.5 text-xs leading-5 text-fog">
								{URL_FILTER_SPEC.helper}
							</p>
						</div>
					) : null}
					<div className="flex justify-end">
						<button
							type="button"
							onClick={onReset}
							className="min-h-11 rounded-lg px-3 text-sm text-fog underline underline-offset-4 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Kembalikan ke pengaturan awal
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
