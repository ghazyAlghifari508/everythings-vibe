import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { scrapeImages } from "@/db/schema";

export type ImageResult = typeof scrapeImages.$inferSelect & {
	assetUrl: string;
};

export function ImagesResult({
	images,
	sourceUrl,
}: {
	images: ImageResult[];
	sourceUrl: string;
}) {
	const [filter, setFilter] = useState("");
	const formats = [
		...new Set(images.flatMap((image) => (image.format ? [image.format] : []))),
	];
	const visible = images.filter(
		(image) =>
			!filter || image.format === filter || image.classification === filter,
	);
	async function download(image: ImageResult) {
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
		}
	}
	const [notice, setNotice] = useState("");
	return (
		<section className="space-y-5">
			<header>
				<h1 className="text-2xl font-semibold text-snow">Images Explorer</h1>
				<a
					href={sourceUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-2 block break-all text-sm text-fog"
				>
					{sourceUrl}
				</a>
			</header>
			<label className="inline-flex items-center gap-3 text-sm text-snow">
				Filter
				<select
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3"
				>
					<option value="">Semua gambar</option>
					{formats.map((format) => (
						<option key={format} value={format}>
							{format}
						</option>
					))}
					{[
						...new Set(
							images.flatMap((image) =>
								image.classification ? [image.classification] : [],
							),
						),
					].map((type) => (
						<option key={type} value={type}>
							{type}
						</option>
					))}
				</select>
			</label>
			{notice && (
				<p role="alert" className="text-sm text-fog">
					{notice}
				</p>
			)}
			{visible.length ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{visible.map((image) => (
						<article
							key={image.id}
							className="min-w-0 overflow-hidden rounded-lg border border-graphite"
						>
							<div className="flex h-52 items-center justify-center bg-onyx p-4">
								<img
									src={image.assetUrl}
									alt={image.evidence.alt ?? ""}
									loading="lazy"
									referrerPolicy="no-referrer"
									className="max-h-full max-w-full object-contain"
									onError={(event) => {
										event.currentTarget.alt = "Gambar tidak dapat dimuat";
									}}
								/>
							</div>
							<div className="space-y-3 p-3">
								<p className="text-xs text-fog">
									{image.format ?? "Format belum diketahui"}
									{image.width && image.height
										? ` · ${image.width} × ${image.height}`
										: ""}
									{image.classification ? ` · ${image.classification}` : ""}
								</p>
								<a
									href={image.url}
									target="_blank"
									rel="noreferrer"
									className="block break-all text-xs text-fog underline"
								>
									{image.url}
								</a>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => void download(image)}
										aria-label="Download gambar"
										title="Download gambar"
										className="inline-flex size-11 items-center justify-center rounded-md border border-graphite text-snow focus-visible:ring-2 focus-visible:ring-indigo"
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
								</div>
							</div>
						</article>
					))}
				</div>
			) : (
				<p className="rounded-lg border border-graphite p-6 text-sm text-fog">
					{images.length
						? "Tidak ada gambar yang sesuai filter."
						: "Tidak ditemukan resource gambar yang dapat diambil dari halaman ini."}
				</p>
			)}
		</section>
	);
}
