/**
 * Static visual reference of the captured page.
 *
 * The surface carries no navigation: the primary tab bar already owns the
 * Visual and HTML Source tabs, and the panel above owns the fallback notice and
 * its recovery action. A capture taller than the viewer scrolls inside it, so a
 * full-page grab stays readable instead of being shrunk to fit.
 */
export function ScreenshotView({
	screenshot,
	domain,
}: {
	screenshot: string;
	domain: string;
}) {
	return (
		<div className="flex flex-col" data-testid="visual-screenshot-view">
			<div className="max-h-[760px] min-h-[300px] w-full overflow-auto bg-onyx">
				<img
					src={screenshot}
					alt={`Tangkapan layar halaman ${domain}`}
					data-testid="scrape-visual-screenshot"
					className="block h-auto w-full max-w-full"
				/>
			</div>
		</div>
	);
}
