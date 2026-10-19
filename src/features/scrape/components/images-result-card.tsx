import {
	Copy01Icon,
	Download01Icon,
	LinkSquare01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
	diagnosticLabels,
	type ImageResult,
	readAssetFailure,
	refreshImageUrl,
} from "./images-result-asset";

export function shortUrl(value: string, max = 48): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}...`;
}

function ImagePreview({
	image,
	src,
	onRefresh,
}: {
	image: ImageResult;
	src: string;
	onRefresh: (url: string) => void;
}) {
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<"loading" | "loaded" | "failed">(
		"loading",
	);
	const [failure, setFailure] = useState<{
		code: string;
		retryable: boolean;
		retryAt: number;
	} | null>(null);
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!failure || failure.retryAt <= Date.now()) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [failure]);
	async function diagnose() {
		setState("failed");
		try {
			const response = await fetch(src);
			if (response.ok) {
				setFailure({ code: "DECODE_FAILED", retryable: true, retryAt: 0 });
				return;
			}
			setFailure(await readAssetFailure(response));
		} catch {
			setFailure({ code: "NETWORK", retryable: true, retryAt: 0 });
		}
	}
	async function retry() {
		if (!failure || failure.retryAt > Date.now()) return;
		setState("loading");
		try {
			if (["CAPABILITY_EXPIRED", "CAPABILITY_INVALID"].includes(failure.code)) {
				onRefresh(await refreshImageUrl(image));
			}
			setFailure(null);
			setAttempt((value) => value + 1);
		} catch {
			setFailure({ code: "REFRESH_FAILED", retryable: true, retryAt: 0 });
			setState("failed");
		}
	}
	const recoverable =
		failure &&
		(failure.retryable ||
			["CAPABILITY_EXPIRED", "CAPABILITY_INVALID"].includes(failure.code));
	return (
		<div className="relative flex h-52 items-center justify-center bg-onyx p-4">
			{state === "loading" && (
				<output className="absolute text-xs text-fog">Memuat gambar...</output>
			)}
			{state !== "failed" ? (
				<img
					key={attempt}
					src={src}
					alt={image.evidence.alt ?? ""}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					className="max-h-full max-w-full object-contain"
					onLoad={() => setState("loaded")}
					onError={() => void diagnose()}
				/>
			) : (
				<div className="space-y-2 text-center text-xs text-fog">
					<p>
						{failure
							? (diagnosticLabels[failure.code] ??
								`Preview gagal dimuat (${failure.code}).`)
							: "Memeriksa kegagalan preview..."}
					</p>
					{recoverable && (
						<button
							type="button"
							disabled={failure.retryAt > now}
							onClick={() => void retry()}
							className="min-h-11 rounded-md border border-graphite px-3 text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
						>
							Coba lagi
							{failure.retryAt > now
								? ` (${Math.ceil((failure.retryAt - now) / 1000)} dtk)`
								: ""}
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export function ImageCard({
	image,
	src,
	downloadDisabled,
	copied,
	onRefresh,
	onDownload,
	onCopy,
}: {
	image: ImageResult;
	src: string;
	downloadDisabled: boolean;
	copied: boolean;
	onRefresh: (url: string) => void;
	onDownload: () => void;
	onCopy: () => void;
}) {
	return (
		<article className="min-w-0 overflow-hidden rounded-xl border border-graphite bg-charcoal">
			<ImagePreview image={image} src={src} onRefresh={onRefresh} />
			<div className="space-y-3 p-3">
				<p className="text-xs text-fog">
					{image.format ?? "Format belum diketahui"}
					{image.width && image.height
						? ` · ${image.width} × ${image.height}`
						: ""}
					{image.classification ? ` · ${image.classification}` : ""}
				</p>
				<details className="min-w-0 text-xs text-fog">
					<summary
						className="cursor-pointer truncate focus-visible:ring-2 focus-visible:ring-indigo"
						title={image.url}
					>
						{shortUrl(image.url)}
					</summary>
					<p className="mt-1 break-all font-mono text-xs">{image.url}</p>
				</details>
				<div className="flex gap-2">
					<button
						disabled={downloadDisabled}
						type="button"
						onClick={onDownload}
						aria-label="Download gambar"
						title="Download gambar"
						className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
					>
						<Icon icon={Download01Icon} size={16} aria-hidden />
					</button>
					<a
						href={image.url}
						target="_blank"
						rel="noreferrer"
						aria-label="Buka gambar asli"
						title="Buka gambar asli"
						className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<Icon icon={LinkSquare01Icon} size={16} aria-hidden />
					</a>
					<button
						type="button"
						onClick={onCopy}
						aria-label="Salin URL sumber"
						title="Salin URL sumber"
						className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{copied ? (
							<Icon icon={Tick01Icon} size={16} aria-hidden />
						) : (
							<Icon icon={Copy01Icon} size={16} aria-hidden />
						)}
					</button>
				</div>
			</div>
		</article>
	);
}
