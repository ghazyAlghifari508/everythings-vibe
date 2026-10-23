/**
 * Static visual reference of the captured page.
 *
 * The surface carries no navigation: the primary tab bar already owns the
 * Visual and HTML Source tabs, and the capture itself needs no explanation to
 * be understood.
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
			<div className="flex max-h-[760px] min-h-[300px] w-full items-center justify-center overflow-auto bg-onyx p-4">
				<img
					src={screenshot}
					alt={`Tangkapan layar halaman ${domain}`}
					data-testid="scrape-visual-screenshot"
					className="max-h-[700px] w-auto max-w-full rounded border border-graphite object-contain"
				/>
			</div>
		</div>
	);
}
