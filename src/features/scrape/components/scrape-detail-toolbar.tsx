import {
	CodeIcon,
	Copy01Icon,
	Download01Icon,
	Image01Icon,
	Tick01Icon,
	ViewIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export type HtmlViewTab = "preview" | "code";

export const ICON_BUTTON_CLASS =
	"inline-flex size-8 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50";

export function ScrapeHtmlToolbar({
	activeTab,
	onSelectTab,
	onFocusTab,
	screenshot,
	screenshotFilename,
	fileName,
	busy,
	copied,
	onDownloadScreenshot,
	onCopy,
	onDownload,
}: {
	activeTab: HtmlViewTab;
	onSelectTab: (tab: HtmlViewTab) => void;
	onFocusTab: (tab: HtmlViewTab) => void;
	screenshot?: string | null;
	screenshotFilename: string;
	fileName: string;
	busy: boolean;
	copied: boolean;
	onDownloadScreenshot: () => void;
	onCopy: () => void;
	onDownload: () => void;
}) {
	const copyLabel = copied ? "HTML tersalin" : "Salin HTML";
	const downloadLabel = `Download ${fileName}`;
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite px-3 py-2">
			<div
				role="tablist"
				aria-label="Tampilan HTML"
				className="flex gap-1 rounded-lg border border-graphite bg-onyx p-1"
			>
				<button
					aria-label="Preview"
					title="Visual"
					tabIndex={activeTab === "preview" ? 0 : -1}
					onKeyDown={(event) => {
						if (["ArrowRight", "ArrowLeft", "End"].includes(event.key)) {
							event.preventDefault();
							onFocusTab("code");
						}
					}}
					id="html-preview-tab"
					type="button"
					role="tab"
					aria-selected={activeTab === "preview"}
					onClick={() => onSelectTab("preview")}
					className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
						activeTab === "preview"
							? "bg-charcoal text-snow"
							: "text-fog hover:text-mist"
					}`}
				>
					<Icon icon={ViewIcon} size={16} aria-hidden />
					<span>Visual</span>
				</button>
				<button
					aria-label="Source HTML / HTML Source"
					title="HTML Source"
					tabIndex={activeTab === "code" ? 0 : -1}
					onKeyDown={(event) => {
						if (["ArrowRight", "ArrowLeft", "Home"].includes(event.key)) {
							event.preventDefault();
							onFocusTab("preview");
						}
					}}
					id="html-code-tab"
					type="button"
					role="tab"
					aria-selected={activeTab === "code"}
					onClick={() => onSelectTab("code")}
					className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
						activeTab === "code"
							? "bg-charcoal text-snow"
							: "text-fog hover:text-mist"
					}`}
				>
					<Icon icon={CodeIcon} size={16} aria-hidden />
					<span className="hidden sm:inline">HTML Source</span>
					<span className="sm:hidden">HTML</span>
				</button>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{screenshot ? (
					<button
						type="button"
						onClick={onDownloadScreenshot}
						disabled={busy}
						aria-label={`Download screenshot ${screenshotFilename}`}
						title={`Download screenshot ${screenshotFilename}`}
						className={ICON_BUTTON_CLASS}
					>
						<Icon icon={Image01Icon} size={15} aria-hidden />
					</button>
				) : null}
				<button
					type="button"
					onClick={onCopy}
					disabled={busy}
					aria-label={copyLabel}
					title={copyLabel}
					className={ICON_BUTTON_CLASS}
				>
					{copied ? (
						<Icon
							icon={Tick01Icon}
							size={15}
							aria-hidden
							className="text-emerald-400"
						/>
					) : (
						<Icon icon={Copy01Icon} size={15} aria-hidden />
					)}
					<span className="sr-only" aria-live="polite">
						{copied ? "HTML berhasil disalin" : ""}
					</span>
				</button>
				<button
					type="button"
					onClick={onDownload}
					disabled={busy}
					aria-label={downloadLabel}
					title={downloadLabel}
					className={ICON_BUTTON_CLASS}
				>
					<Icon icon={Download01Icon} size={15} aria-hidden />
				</button>
			</div>
		</div>
	);
}
