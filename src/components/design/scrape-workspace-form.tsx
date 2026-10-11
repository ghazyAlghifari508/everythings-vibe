import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Loader2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { z } from "zod";
import type { ScrapeMode } from "@/db/schema";
import {
	crawlSettingsSchema,
	htmlSettingsSchema,
	imagesSettingsSchema,
	SCRAPE_LIMITS,
	scrapeRequestSchema,
} from "@/lib/scrape-contract";

const responseSchema = z.object({ scrapeId: z.string() });
const errorSchema = z.object({ error: z.string() });
const fieldClass =
	"min-h-11 w-full rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

export function ScrapeWorkspaceForm({ mode }: { mode: ScrapeMode }) {
	const navigate = useNavigate();
	const [input, setInput] = useState("");
	const [protocol, setProtocol] = useState("https://");
	const [crawl, setCrawl] = useState(() => crawlSettingsSchema.parse({}));
	const [html, setHtml] = useState(() => htmlSettingsSchema.parse({}));
	const [images, setImages] = useState(() => imagesSettingsSchema.parse({}));
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const submitting = useRef(false);
	const requestKey = useRef<{ body: string; key: string } | null>(null);
	function reset() {
		if (mode === "crawl") setCrawl(crawlSettingsSchema.parse({}));
		if (mode === "html") setHtml(htmlSettingsSchema.parse({}));
		if (mode === "images") setImages(imagesSettingsSchema.parse({}));
		setError("");
	}
	function changeUrl(value: string) {
		const match = /^(https?:\/\/)(.*)$/i.exec(value.trim());
		if (match) {
			setProtocol(match[1].toLowerCase());
			setInput(match[2]);
		} else setInput(value);
	}
	async function submit(event: FormEvent) {
		event.preventDefault();
		if (submitting.current) return;
		const suffix = input.trim();
		const url =
			/^[a-z][a-z\d+.-]*:/i.test(suffix) && !/^[^/]+:\d+(?:\/|$)/.test(suffix)
				? suffix
				: `${protocol}${suffix}`;
		const parsed = scrapeRequestSchema.safeParse({
			url,
			mode,
			...(mode === "design"
				? {}
				: {
						settings:
							mode === "crawl" ? crawl : mode === "html" ? html : images,
					}),
		});
		if (!parsed.success) {
			setError(
				parsed.error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join(" "),
			);
			return;
		}
		submitting.current = true;
		const body = JSON.stringify(parsed.data);
		if (requestKey.current?.body !== body)
			requestKey.current = { body, key: crypto.randomUUID() };
		setPending(true);
		setError("");
		try {
			const response = await fetch("/api/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": requestKey.current.key,
				},
				body,
			});
			const responseBody: unknown = await response.json();
			const result = responseSchema.safeParse(responseBody);
			if (!response.ok || !result.success) {
				setError(
					errorSchema.safeParse(responseBody).data?.error ??
						"Proses belum bisa dimulai. Coba lagi.",
				);
				return;
			}
			await navigate({
				to: "/design/scrap/$id",
				params: { id: result.data.scrapeId },
				search: { from: "/design/scrap" },
			});
		} catch {
			setError("Jaringan bermasalah. Coba lagi dari URL yang sama.");
		} finally {
			submitting.current = false;
			setPending(false);
		}
	}
	const wait = mode === "html" ? html.waitMs : images.waitMs;
	return (
		<form
			onSubmit={(event) => void submit(event)}
			className="mx-auto w-full max-w-3xl text-left"
		>
			<fieldset disabled={pending} className="min-w-0">
				<div className="flex items-stretch gap-3">
					<div className="flex h-14 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-graphite bg-charcoal focus-within:ring-2 focus-within:ring-indigo">
						<span className="flex h-full shrink-0 items-center border-r border-graphite px-3 font-mono text-sm text-fog">
							{protocol}
						</span>
						<label htmlFor="scrape-url" className="sr-only">
							URL website
						</label>
						<input
							id="scrape-url"
							name="url"
							inputMode="url"
							autoComplete="url"
							value={input}
							onChange={(event) => changeUrl(event.target.value)}
							placeholder="example.com"
							required
							maxLength={SCRAPE_LIMITS.urlChars}
							aria-invalid={!!error}
							aria-describedby="scrape-form-error"
							className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-snow outline-none placeholder:text-fog [--autofill-bg:var(--color-charcoal)]"
						/>
					</div>
					<button
						type="submit"
						disabled={pending || !input.trim()}
						aria-label={`Jalankan ${mode === "design" ? "Generate DESIGN.md" : mode === "crawl" ? "Crawl Website" : mode === "images" ? "Scrape Images" : "Scrape HTML"}`}
						title="Mulai ekstraksi"
						className="btn-primary inline-flex size-14 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40"
					>
						{pending ? (
							<Loader2
								size={20}
								aria-hidden
								className="motion-safe:animate-spin"
							/>
						) : (
							<ArrowUp size={20} aria-hidden />
						)}
					</button>
				</div>
				{mode !== "design" && (
					<details className="mt-5 rounded-lg border border-graphite">
						<summary className="cursor-pointer px-4 py-4 text-sm font-semibold text-snow focus-visible:ring-2 focus-visible:ring-indigo">
							Advanced parameters
						</summary>
						<div className="grid gap-5 border-t border-graphite p-4 sm:grid-cols-2">
							{mode === "crawl" ? (
								<>
									<label className="space-y-2 text-sm text-snow">
										Max Pages
										<input
											type="number"
											min={1}
											max={SCRAPE_LIMITS.maxPages}
											value={crawl.maxPages}
											onChange={(event) =>
												setCrawl({
													...crawl,
													maxPages: event.target.valueAsNumber,
												})
											}
											className={fieldClass}
										/>
										<span className="block text-xs text-fog">
											Maksimal {SCRAPE_LIMITS.maxPages} halaman, termasuk
											halaman awal.
										</span>
									</label>
									<label className="space-y-2 text-sm text-snow">
										Max Depth
										<input
											type="number"
											min={0}
											max={SCRAPE_LIMITS.maxDepth}
											value={crawl.maxDepth}
											onChange={(event) =>
												setCrawl({
													...crawl,
													maxDepth: event.target.valueAsNumber,
												})
											}
											className={fieldClass}
										/>
										<span className="block text-xs text-fog">
											Depth 0 hanya mengambil halaman awal.
										</span>
									</label>
									<label className="space-y-2 text-sm text-snow sm:col-span-2">
										URL Regex
										<input
											value={crawl.urlRegex}
											maxLength={SCRAPE_LIMITS.regexChars}
											onChange={(event) =>
												setCrawl({ ...crawl, urlRegex: event.target.value })
											}
											className={fieldClass}
										/>
										<span className="block text-xs text-fog">
											Filter URL yang ditemukan; halaman awal selalu diproses.
										</span>
									</label>
									{(
										[
											"mainContentOnly",
											"followSubdomains",
											"includeLinks",
											"includeImages",
										] as const
									).map((key) => (
										<label
											key={key}
											className="flex items-center gap-2 text-sm text-snow"
										>
											<input
												type="checkbox"
												checked={crawl[key]}
												onChange={(event) =>
													setCrawl({ ...crawl, [key]: event.target.checked })
												}
												className="size-4 accent-current"
											/>
											{
												{
													mainContentOnly: "Main content only",
													followSubdomains: "Follow subdomains",
													includeLinks: "Include links",
													includeImages: "Include images",
												}[key]
											}
										</label>
									))}
								</>
							) : (
								<>
									<label className="space-y-2 text-sm text-snow">
										Wait for (ms)
										<input
											type="number"
											min={0}
											max={SCRAPE_LIMITS.waitMs}
											value={wait}
											onChange={(event) =>
												mode === "html"
													? setHtml({
															...html,
															waitMs: event.target.valueAsNumber,
														})
													: setImages({
															...images,
															waitMs: event.target.valueAsNumber,
														})
											}
											className={fieldClass}
										/>
										<span className="block text-xs text-fog">
											Tambahan waktu capture, maksimal {SCRAPE_LIMITS.waitMs}{" "}
											ms.
										</span>
									</label>
									{mode === "html" ? (
										<label className="flex items-center gap-2 text-sm text-snow">
											<input
												type="checkbox"
												checked={html.includeIframes}
												onChange={(event) =>
													setHtml({
														...html,
														includeIframes: event.target.checked,
													})
												}
												className="size-4"
											/>
											Include iframes
										</label>
									) : (
										<div className="space-y-4">
											{(["measureResolution", "classifyType"] as const).map(
												(key) => (
													<label
														key={key}
														className="flex items-center gap-2 text-sm text-snow"
													>
														<input
															type="checkbox"
															checked={images[key]}
															onChange={(event) =>
																setImages({
																	...images,
																	[key]: event.target.checked,
																})
															}
															className="size-4"
														/>
														{key === "measureResolution"
															? "Measure resolution"
															: "Classify type"}
													</label>
												),
											)}
										</div>
									)}
								</>
							)}
							<div className="flex justify-end sm:col-span-2">
								<button
									type="button"
									onClick={reset}
									className="min-h-11 text-sm text-fog underline underline-offset-4 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Reset parameters
								</button>
							</div>
						</div>
					</details>
				)}
			</fieldset>
			<p
				id="scrape-form-error"
				role={error ? "alert" : undefined}
				className="mt-3 text-sm text-fog"
			>
				{error || "Gunakan website publik yang dapat diakses tanpa login."}
			</p>
		</form>
	);
}
