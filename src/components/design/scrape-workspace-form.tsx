"use client";

import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, ChevronDown, Loader2 } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { z } from "zod";
import type { ScrapeMode } from "@/db/schema";
import {
	crawlSettingsSchema,
	htmlSettingsSchema,
	imagesSettingsSchema,
	SCRAPE_LIMITS,
	scrapeRequestSchema,
} from "@/lib/scrape-contract";
import { cn } from "@/lib/utils";
import { ScrapeFormNotice } from "./scrape-form-notice";
import {
	ADVANCED_PARAMETER_GROUPS,
	type AdvancedParameterGroup,
	type AnyScrapeSettings,
	type NumericParameterSpec,
	readNumber,
	readToggle,
	type ToggleParameterSpec,
	URL_FILTER_SPEC,
	validateParameterGroup,
} from "./scrape-parameter-spec";

const responseSchema = z.object({ scrapeId: z.string() });
const errorSchema = z.object({ error: z.string() });
const fieldClass =
	"min-h-11 w-full rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

// Controlled disclosure following the existing in-repo accordion pattern: a
// real button with aria-expanded, a rotating chevron and a focus ring, instead
// of a native <details> whose summary cannot carry a proper affordance.
function ParameterGroup({
	group,
	settings,
	issues,
	onNumberChange,
	onToggleChange,
}: {
	group: AdvancedParameterGroup;
	settings: AnyScrapeSettings;
	issues: Record<string, string>;
	onNumberChange: (key: NumericParameterSpec["key"], value: number) => void;
	onToggleChange: (key: ToggleParameterSpec["key"], value: boolean) => void;
}) {
	const baseId = useId();
	return (
		<div className="min-w-0">
			<p className="text-xs font-semibold tracking-wide text-fog uppercase">
				{group.title}
			</p>
			<p className="mt-1 text-xs leading-5 text-fog">{group.description}</p>
			<div className="mt-4 grid gap-4 sm:grid-cols-2">
				{group.numbers.map((spec) => (
					<NumberField
						key={spec.key}
						spec={spec}
						value={readNumber(settings, spec.key)}
						issue={issues[spec.key]}
						onChange={(value) => onNumberChange(spec.key, value)}
						id={`${baseId}-${spec.key}`}
					/>
				))}
				{group.toggles.map((toggle) => (
					<label
						key={toggle.key}
						className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-graphite p-3 focus-within:ring-2 focus-within:ring-indigo sm:col-span-2"
					>
						<input
							type="checkbox"
							checked={readToggle(settings, toggle.key)}
							onChange={(event) =>
								onToggleChange(toggle.key, event.target.checked)
							}
							className="mt-0.5 size-4 shrink-0 accent-current"
						/>
						<span className="min-w-0">
							<span className="block text-sm font-medium text-snow">
								{toggle.label}
							</span>
							<span className="mt-0.5 block text-xs leading-5 text-fog">
								{toggle.helper}
							</span>
						</span>
					</label>
				))}
			</div>
		</div>
	);
}

function NumberField({
	spec,
	value,
	issue,
	onChange,
	id,
}: {
	spec: NumericParameterSpec;
	value: number;
	issue?: string;
	onChange: (value: number) => void;
	id: string;
}) {
	const helperId = `${id}-helper`;
	const errorId = `${id}-error`;
	return (
		<div className="min-w-0">
			<label
				htmlFor={id}
				className="flex items-baseline justify-between gap-2 text-sm font-medium text-snow"
			>
				{spec.label}
				<span className="shrink-0 font-mono text-xs text-fog">{spec.unit}</span>
			</label>
			<input
				id={id}
				type="number"
				inputMode="numeric"
				min={spec.min}
				max={spec.max}
				step={1}
				value={Number.isFinite(value) ? value : ""}
				onChange={(event) => onChange(event.target.valueAsNumber)}
				aria-invalid={issue ? true : undefined}
				aria-describedby={issue ? errorId : helperId}
				className={cn(
					fieldClass,
					"mt-1.5",
					issue && "border-crimson focus-visible:ring-crimson",
				)}
			/>
			{issue ? (
				<p id={errorId} role="alert" className="mt-1.5 text-xs text-crimson">
					{issue}
				</p>
			) : (
				<p id={helperId} className="mt-1.5 text-xs leading-5 text-fog">
					{spec.helper}
				</p>
			)}
		</div>
	);
}

export function ScrapeWorkspaceForm({ mode }: { mode: ScrapeMode }) {
	const navigate = useNavigate();
	const [input, setInput] = useState("");
	const [protocol, setProtocol] = useState("https://");
	const [crawl, setCrawl] = useState(() => crawlSettingsSchema.parse({}));
	const [html, setHtml] = useState(() => htmlSettingsSchema.parse({}));
	const [images, setImages] = useState(() => imagesSettingsSchema.parse({}));
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const submitting = useRef(false);
	const requestKey = useRef<{ body: string; key: string } | null>(null);
	const advancedPanelId = useId();
	// Each mode owns a different parameter set, so the panel collapses again when
	// the mode changes instead of reopening with an unrelated group expanded.
	const [disclosureMode, setDisclosureMode] = useState(mode);
	if (disclosureMode !== mode) {
		setDisclosureMode(mode);
		setAdvancedOpen(false);
	}

	const groups = ADVANCED_PARAMETER_GROUPS[mode];
	const hasAdvanced = groups.length > 0;

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

	// Only the active mode's settings object is ever read or written, so a
	// parameter can never leak between modes.
	const activeSettings: AnyScrapeSettings =
		mode === "crawl" ? crawl : mode === "html" ? html : images;

	const issues = groups
		.flatMap((group) => validateParameterGroup(group, activeSettings))
		.reduce<Record<string, string>>((accumulator, issue) => {
			accumulator[issue.key] = issue.message;
			return accumulator;
		}, {});

	function updateNumber(key: NumericParameterSpec["key"], value: number) {
		if (mode === "crawl") setCrawl({ ...crawl, [key]: value });
		if (mode === "html") setHtml({ ...html, [key]: value });
		if (mode === "images") setImages({ ...images, [key]: value });
	}
	function updateToggle(key: ToggleParameterSpec["key"], value: boolean) {
		if (mode === "crawl") setCrawl({ ...crawl, [key]: value });
		if (mode === "html") setHtml({ ...html, [key]: value });
		if (mode === "images") setImages({ ...images, [key]: value });
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
				<ScrapeFormNotice className="mt-3" />

				{hasAdvanced ? (
					<div className="mt-5 min-w-0 rounded-lg border border-graphite">
						<h2 className="min-w-0">
							<button
								type="button"
								onClick={() => setAdvancedOpen((open) => !open)}
								aria-expanded={advancedOpen}
								aria-controls={advancedPanelId}
								className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<span className="min-w-0">
									<span className="block text-sm font-semibold text-snow">
										Parameter lanjutan
									</span>
									<span className="mt-0.5 block text-xs text-fog">
										{mode === "crawl"
											? "Cakupan crawl dan jenis data yang disimpan"
											: mode === "html"
												? "Cara halaman diambil sebelum disimpan"
												: "Seberapa detail setiap gambar diperiksa"}
									</span>
								</span>
								<ChevronDown
									size={18}
									aria-hidden
									className={cn(
										"shrink-0 text-fog transition-transform motion-reduce:transition-none",
										advancedOpen && "rotate-180",
									)}
								/>
							</button>
						</h2>
						{advancedOpen ? (
							<div
								id={advancedPanelId}
								className="flex min-w-0 flex-col gap-6 border-t border-graphite p-4"
							>
								{groups.map((group) => (
									<ParameterGroup
										key={group.key}
										group={group}
										settings={activeSettings}
										issues={issues}
										onNumberChange={updateNumber}
										onToggleChange={updateToggle}
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
											value={crawl.urlRegex}
											maxLength={SCRAPE_LIMITS.regexChars}
											onChange={(event) =>
												setCrawl({ ...crawl, urlRegex: event.target.value })
											}
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
										onClick={reset}
										className="min-h-11 rounded-lg px-3 text-sm text-fog underline underline-offset-4 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
									>
										Kembalikan ke pengaturan awal
									</button>
								</div>
							</div>
						) : null}
					</div>
				) : null}
			</fieldset>
			<p
				id="scrape-form-error"
				role={error ? "alert" : undefined}
				className={cn("mt-3 text-sm", error ? "text-crimson" : "text-fog")}
			>
				{error || "Gunakan website publik yang dapat diakses tanpa login."}
			</p>
		</form>
	);
}
