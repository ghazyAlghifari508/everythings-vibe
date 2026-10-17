import type {
	InspectorRadiusToken,
	InspectorToken,
} from "@/lib/design-md-inspector";
import { isPillRadius } from "@/lib/design-normalize-shape";

export function SpacingRow({ token }: { token: InspectorToken }) {
	const px = token.value.trim().match(/^([\d.]+)px$/);
	const pxValue = px?.[1] !== undefined ? Number(px[1]) : null;
	const isZero = pxValue === 0;
	const width =
		pxValue !== null && Number.isFinite(pxValue) && !isZero
			? Math.min(180, Math.max(12, pxValue))
			: null;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
			<div className="min-w-0">
				<p className="truncate text-sm text-snow" title={token.label}>
					{token.label}
				</p>
				<p className="font-mono text-xs text-fog tabular-nums">
					{token.value}
					{token.frequency > 1 ? (
						<span className="ml-2 text-slate">{token.frequency} elemen</span>
					) : null}
				</p>
				{token.context ? (
					<p className="mt-0.5 truncate text-[11px] leading-4 text-slate">
						{token.context}
					</p>
				) : null}
			</div>
			{isZero ? (
				<span
					role="img"
					aria-label={`${token.label} nol, tidak ada jarak`}
					title="0px — tidak ada jarak"
					className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-slate font-mono text-[10px] text-slate"
				>
					0
				</span>
			) : width !== null && Number.isFinite(width) ? (
				<div
					role="img"
					aria-label={`${token.label} ${token.value}`}
					title={token.value}
					className="h-2.5 shrink-0 rounded-sm border border-slate/40 bg-snow"
					style={{ width }}
				/>
			) : null}
		</div>
	);
}

export function RadiusRow({ token }: { token: InspectorRadiusToken }) {
	const normalized = token.value.trim().toLowerCase();
	const isPill =
		normalized.includes("full") ||
		normalized.includes("pill") ||
		normalized === "50%" ||
		isPillRadius(token.valuePx);
	const previewRadius = isPill
		? "999px"
		: Number.isFinite(token.valuePx)
			? `${Math.min(24, token.valuePx)}px`
			: undefined;
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm text-snow" title={token.label}>
					{token.label}
				</p>
				<p className="font-mono text-xs text-fog tabular-nums">
					{token.value}
					{token.frequency > 1 ? (
						<span className="ml-2 text-slate">{token.frequency} elemen</span>
					) : null}
				</p>
				{token.context ? (
					<p className="mt-0.5 truncate text-[11px] leading-4 text-slate">
						{token.context}
					</p>
				) : null}
			</div>
			{/* A real rounded-corner preview at the measured radius. */}
			<div
				role="img"
				aria-label={`${token.label} ${token.value}`}
				title={token.value}
				className="size-12 shrink-0 border border-graphite bg-onyx"
				style={previewRadius ? { borderRadius: previewRadius } : undefined}
			/>
		</div>
	);
}
