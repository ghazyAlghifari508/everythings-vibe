import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { imageCountsLabel, imageResultCounts } from "@/lib/scrape-images";
import type { ScrapeImageResult } from "@/lib/services/scrape-service";
import { ScrapeFilterSelect } from "./scrape-filter-select";

export type ImageResult = ScrapeImageResult;

const diagnosticSchema = z.object({
	error: z.object({
		code: z.string(),
		retryable: z.boolean(),
		retryAfterSeconds: z.number().nonnegative().optional(),
	}),
});
const diagnosticLabels: Record<string, string> = {
	PROXY_RATE_LIMITED: "Batas proxy tercapai. Tunggu sebelum mencoba lagi.",
	CAPABILITY_EXPIRED:
		"Akses preview kedaluwarsa. Perbarui akses untuk mencoba lagi.",
	CAPABILITY_INVALID:
		"Akses preview tidak valid. Perbarui akses untuk mencoba lagi.",
	STORED_BYTES_MISSING: "Byte gambar tersimpan tidak tersedia.",
	STORED_BYTES_INVALID: "Isi gambar tersimpan tidak dapat diverifikasi.",
	OWNERSHIP_DENIED: "Akses ke hasil ini tidak diizinkan.",
	AUTHENTICATION_REQUIRED:
		"Sesi berakhir. Masuk kembali untuk mengakses gambar.",
	REMOTE_TIMEOUT: "Sumber gambar melewati batas waktu.",
	REMOTE_FETCH_FAILED: "Proxy gagal mengambil gambar dari sumber.",
	UNSUPPORTED_MIME: "Format respons tidak aman untuk preview.",
	ASSET_TOO_LARGE: "Ukuran gambar melewati batas proxy.",
};

function ImagePreview({ image }: { image: ImageResult }) {
	const [src, setSrc] = useState(image.assetUrl);
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
			const parsed = diagnosticSchema.safeParse(await response.json());
			const error = parsed.success
				? parsed.data.error
				: { code: "UNKNOWN", retryable: false };
			setFailure({
				...error,
				retryAt: error.retryAfterSeconds
					? Date.now() + error.retryAfterSeconds * 1000
					: 0,
			});
		} catch {
			setFailure({ code: "NETWORK", retryable: true, retryAt: 0 });
		}
	}
	async function retry() {
		if (!failure || failure.retryAt > Date.now()) return;
		setState("loading");
		try {
			if (["CAPABILITY_EXPIRED", "CAPABILITY_INVALID"].includes(failure.code)) {
				const response = await fetch(
					`/api/scrape?id=${encodeURIComponent(image.scrapeId)}`,
				);
				if (!response.ok) throw new Error("Refresh failed");
				const result = z
					.object({
						scrape: z.object({
							images: z.array(
								z.object({ id: z.string(), assetUrl: z.string() }),
							),
						}),
					})
					.parse(await response.json());
				const refreshed = result.scrape.images.find(
					(row) => row.id === image.id,
				);
				if (!refreshed) throw new Error("Missing image");
				setSrc(refreshed.assetUrl);
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
				<output className="absolute text-xs text-fog">Memuat gambar…</output>
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
							: "Memeriksa kegagalan preview…"}
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

function shortUrl(value: string, max = 48): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

export function ImagesResult({
	images,
	sourceUrl,
	imageOutcome,
}: {
	images: ImageResult[];
	sourceUrl: string;
	imageOutcome?: "complete" | "partial" | "empty" | "all-failed" | null;
}) {
	const [formatFilter, setFormatFilter] = useState("");
	const [kindFilter, setKindFilter] = useState("");
	const [search, setSearch] = useState("");
	const [downloading, setDownloading] = useState<string | null>(null);
	const [copied, setCopied] = useState<string | null>(null);
	const formats = [
		...new Set(images.flatMap((image) => (image.format ? [image.format] : []))),
	];
	const kinds = [
		...new Set(
			images.flatMap((image) =>
				image.classification ? [image.classification] : [],
			),
		),
	];
	const counts = imageResultCounts(images);
	const saved = counts.verified;
	const failed = images.filter((image) => image.status === "failed").length;
	const visible = images.filter(
		(image) =>
			image.status === "completed" &&
			`${image.url} ${image.evidence.alt ?? ""}`
				.toLowerCase()
				.includes(search.toLowerCase()) &&
			(!formatFilter || image.format === formatFilter) &&
			(!kindFilter || image.classification === kindFilter),
	);
	const hasFilter = formatFilter !== "" || kindFilter !== "" || search !== "";
	async function download(image: ImageResult) {
		if (downloading) return;
		setDownloading(image.id);
		setNotice("");
		try {
			const response = await fetch(image.assetUrl);
			if (!response.ok) throw new Error("Download gagal.");
			const url = URL.createObjectURL(await response.blob());
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `image-${image.id}.${image.format ?? "bin"}`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			setNotice("Gambar gagal diunduh. Buka sumber asli atau coba lagi.");
		} finally {
			setDownloading(null);
		}
	}
	async function copySource(image: ImageResult) {
		try {
			await navigator.clipboard.writeText(image.url);
			setCopied(image.id);
			setTimeout(() => {
				setCopied((current) => (current === image.id ? null : current));
			}, 1500);
		} catch {
			setNotice("URL sumber gagal disalin.");
		}
	}
	const [notice, setNotice] = useState("");
	return (
		<section className="space-y-5" aria-label="Images Explorer">
			<header>
				<h2 className="text-2xl font-bold text-snow">Images Explorer</h2>
				<a
					href={sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-2 block max-w-full truncate font-mono text-xs text-fog"
					title={sourceUrl}
				>
					{sourceUrl}
				</a>
				<p className="mt-3 font-mono text-xs text-fog tabular-nums">
					{imageCountsLabel(counts)}
				</p>
				{imageOutcome === "partial" && (
					<p className="mt-2 text-sm text-fog">
						Sebagian gambar berhasil diambil. {saved} gambar terverifikasi.{" "}
						{failed} resource gagal diverifikasi.
					</p>
				)}
			</header>
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex min-w-0 flex-col gap-1.5 text-xs text-fog">
					Cari gambar
					<input
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					/>
				</label>
				<ScrapeFilterSelect
					label="Format"
					value={formatFilter}
					onChange={setFormatFilter}
					options={[
						{ value: "", label: "Semua" },
						...formats.map((format) => ({ value: format, label: format })),
					]}
				/>
				<ScrapeFilterSelect
					label="Jenis"
					value={kindFilter}
					onChange={setKindFilter}
					options={[
						{ value: "", label: "Semua" },
						...kinds.map((type) => ({ value: type, label: type })),
					]}
				/>
				{hasFilter && (
					<button
						type="button"
						onClick={() => {
							setFormatFilter("");
							setKindFilter("");
							setSearch("");
						}}
						className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-fog underline underline-offset-4 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Reset filter
					</button>
				)}
			</div>
			{notice && (
				<p role="alert" className="text-sm text-fog">
					{notice}
				</p>
			)}
			{failed > 0 && (
				<details className="text-sm text-fog">
					<summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo">
						{failed} gambar tidak dapat diambil
					</summary>
					<ul className="mt-3 space-y-2">
						{images
							.filter((image) => image.status === "failed")
							.map((image) => (
								<li key={image.id} className="min-w-0">
									<p className="truncate font-mono text-xs" title={image.url}>
										{shortUrl(image.url)}
									</p>
									{image.error ? (
										<p className="mt-1 font-mono text-xs">{image.error}</p>
									) : null}
								</li>
							))}
					</ul>
				</details>
			)}
			{visible.length ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{visible.map((image) => (
						<article
							key={image.id}
							className="min-w-0 overflow-hidden rounded-xl border border-graphite bg-charcoal"
						>
							<ImagePreview image={image} />
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
									<p className="mt-1 break-all font-mono text-xs">
										{image.url}
									</p>
								</details>
								<div className="flex gap-2">
									<button
										disabled={downloading !== null}
										type="button"
										onClick={() => void download(image)}
										aria-label="Download gambar"
										title="Download gambar"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo disabled:opacity-50"
									>
										<Download size={16} aria-hidden />
									</button>
									<a
										href={image.url}
										target="_blank"
										rel="noreferrer"
										aria-label="Buka gambar asli"
										title="Buka gambar asli"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										<ExternalLink size={16} aria-hidden />
									</a>
									<button
										type="button"
										onClick={() => void copySource(image)}
										aria-label="Salin URL sumber"
										title="Salin URL sumber"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										{copied === image.id ? (
											<Check size={16} aria-hidden />
										) : (
											<Copy size={16} aria-hidden />
										)}
									</button>
								</div>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-xl border border-graphite bg-charcoal p-6">
					{images.length === 0 && imageOutcome === "empty" ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Tidak ada gambar yang ditemukan
							</p>
							<p className="mt-1 text-sm text-fog">
								Halaman berhasil diperiksa, tetapi tidak ada gambar yang dapat
								diambil.
							</p>
						</>
					) : images.length > 0 && saved === 0 ? (
						<>
							<p className="text-sm font-semibold text-snow">
								Semua gambar gagal diambil
							</p>
							<p className="mt-1 text-sm text-fog">
								Tidak ada byte gambar yang tersedia dari ekstraksi ini. Periksa
								alasan kegagalan di atas.
							</p>
						</>
					) : (
						<p className="text-sm text-fog">
							{images.length
								? "Tidak ada gambar yang sesuai filter."
								: "Tidak ditemukan resource gambar yang dapat diambil dari halaman ini."}
						</p>
					)}
				</div>
			)}
		</section>
	);
}
