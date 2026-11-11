import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Spinner } from "@/components/ui/spinner";
import { readStudioApiError } from "../../services/studio-frame-retry-client";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	type StudioElementTarget,
	studioElementIdentitySchema,
} from "../../types/studio-element";
import { acceptStudioSelectionMessage } from "../../utils/studio-element-bridge";

const inspectionSchema = z.object({
	html: z.string().max(2_000_000),
	baseHash: z.string().regex(/^[a-f0-9]{64}$/),
	elements: z.array(studioElementIdentitySchema),
	projectId: z.string(),
	frameId: z.string(),
	baseRevision: z.int(),
	channel: z.uuid(),
});
export function StudioElementSurface({
	projectId,
	frameId,
	baseRevision,
	name,
	target,
	onSelect,
	revisionId,
	side,
	suspended = false,
}: {
	projectId: string;
	frameId: string;
	baseRevision: number;
	name: string;
	target?: StudioElementTarget | null;
	onSelect?: (target: StudioElementTarget | null) => void;
	revisionId?: string;
	side?: "before" | "after";
	suspended?: boolean;
}) {
	const iframe = useRef<HTMLIFrameElement>(null);
	const [attempt, setAttempt] = useState(() => ({
		channel: crypto.randomUUID(),
	}));
	const [data, setData] = useState<z.infer<typeof inspectionSchema> | null>(
		null,
	);
	const [error, setError] = useState("");
	const select = useRef(onSelect);
	select.current = onSelect;
	const activeTarget = useRef(target);
	activeTarget.current = target;
	useEffect(() => {
		const controller = new AbortController();
		setData(null);
		setError("");
		const channel = attempt.channel;
		const params = new URLSearchParams({
			projectId,
			frameId,
			baseRevision: String(baseRevision),
			channel,
			inspect: "1",
		});
		if (revisionId) params.set("revisionId", revisionId);
		if (side) params.set("side", side);
		void (async () => {
			try {
				const response = await fetch(`/api/studio/frame?${params}`, {
					signal: AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
					]),
				});
				if (!response.ok)
					throw new Error(
						await readStudioApiError(
							response,
							"Permukaan inspeksi belum dapat dimuat.",
						),
					);
				const parsed = inspectionSchema.parse(await response.json());
				if (
					parsed.channel !== channel ||
					parsed.projectId !== projectId ||
					parsed.frameId !== frameId ||
					parsed.baseRevision !== baseRevision
				)
					throw new Error("Versi inspeksi tidak sesuai. Pilih ulang elemen.");
				if (!controller.signal.aborted) setData(parsed);
			} catch (failure) {
				if (!controller.signal.aborted)
					setError(
						failure instanceof Error
							? failure.message
							: "Permukaan inspeksi belum dapat dimuat.",
					);
			}
		})();
		return () => controller.abort();
	}, [projectId, frameId, baseRevision, revisionId, side, attempt]);
	useEffect(() => {
		if (!data || !select.current) return;
		function message(event: MessageEvent<unknown>) {
			if (!data) return;
			const result = acceptStudioSelectionMessage(event, {
				...data,
				source: iframe.current?.contentWindow,
			});
			if (
				result &&
				(result.type !== "studio:element:bounds" ||
					activeTarget.current?.elementId === result.target?.elementId)
			)
				select.current?.(result.target);
		}
		window.addEventListener("message", message);
		return () => window.removeEventListener("message", message);
	}, [data]);
	return (
		<div
			className="relative size-full overflow-hidden bg-white"
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{data ? (
				<iframe
					ref={iframe}
					title={`${onSelect ? "Pilih elemen" : side === "before" ? "Sebelum revisi" : "Setelah revisi"}: ${name}`}
					sandbox="allow-scripts"
					referrerPolicy="no-referrer"
					srcDoc={data.html}
					className="size-full border-0"
					style={{ pointerEvents: suspended ? "none" : "auto" }}
				/>
			) : error ? (
				<div
					role="alert"
					className="flex h-full flex-col items-center justify-center gap-3 bg-obsidian p-4 text-sm text-snow"
				>
					<p>{error}</p>
					<button
						type="button"
						className="min-h-11 rounded-md border border-graphite px-3 focus-visible:outline-2 focus-visible:outline-snow"
						onClick={() => setAttempt({ channel: crypto.randomUUID() })}
					>
						Muat ulang inspeksi
					</button>
				</div>
			) : (
				<output className="flex h-full items-center justify-center gap-2 bg-obsidian text-sm text-fog">
					<Spinner size={18} />
					Menyiapkan HTML terisolasi
				</output>
			)}
			{onSelect && target && data?.baseHash === target.baseHash ? (
				<div
					aria-hidden
					data-ev-editor-overlay
					className="pointer-events-none absolute border-2 border-blue-600"
					style={{
						left: target.bounds.x,
						top: target.bounds.y,
						width: target.bounds.width,
						height: target.bounds.height,
					}}
				/>
			) : null}
		</div>
	);
}
