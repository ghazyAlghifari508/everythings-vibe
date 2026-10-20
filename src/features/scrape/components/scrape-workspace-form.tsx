"use client";

import { ArrowUp01Icon, Loading01Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useId, useRef, useState } from "react";
import { z } from "zod";
import { Icon } from "@/components/ui/icon";
import type { ScrapeMode } from "@/db/schema";
import {
	crawlSettingsSchema,
	designSettingsSchema,
	htmlSettingsSchema,
	imagesSettingsSchema,
	SCRAPE_LIMITS,
	scrapeRequestSchema,
} from "@/features/scrape/types/scrape-contract";
import {
	ADVANCED_PARAMETER_GROUPS,
	type AnyScrapeSettings,
	type NumericParameterSpec,
	type ToggleParameterSpec,
	validateParameterGroup,
} from "../types/parameter-spec";
import { ScrapeFormNotice } from "./scrape-form-notice";
import { ScrapeWorkspaceAdvancedPanel } from "./scrape-workspace-advanced-panel";

const responseSchema = z.object({ scrapeId: z.string() });
const errorSchema = z.object({ error: z.string() });

export function ScrapeWorkspaceForm({ mode }: { mode: ScrapeMode }) {
	const navigate = useNavigate();
	const [input, setInput] = useState("");
	const [protocol, setProtocol] = useState("https://");
	const [crawl, setCrawl] = useState(() => crawlSettingsSchema.parse({}));
	const [design, setDesign] = useState(() => designSettingsSchema.parse({}));
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
		if (mode === "design") setDesign(designSettingsSchema.parse({}));
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
		mode === "design"
			? design
			: mode === "crawl"
				? crawl
				: mode === "html"
					? html
					: images;

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
			settings: activeSettings,
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
				to: "/scrape/$id",
				params: { id: result.data.scrapeId },
				search: { from: "/scrape", mode },
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
				<div className="rounded-xl border border-graphite bg-charcoal focus-within:ring-2 focus-within:ring-indigo">
					<ScrapeFormNotice tone="plain" />
					<div aria-hidden className="mx-4 mt-4 border-t border-graphite" />
					<div className="flex items-stretch gap-2.5 p-3 sm:gap-3 sm:p-3.5">
						<div className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-transparent sm:h-12">
							<span className="flex h-full shrink-0 items-center border-r border-graphite px-3 font-mono text-xs text-fog sm:text-sm">
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
								aria-describedby={error ? "scrape-form-error" : undefined}
								className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-snow outline-none placeholder:text-fog sm:text-sm [--autofill-bg:var(--color-charcoal)]"
							/>
						</div>
						<button
							type="submit"
							disabled={pending || !input.trim()}
							aria-label={`Jalankan ${mode === "design" ? "Generate DESIGN.md" : mode === "crawl" ? "Crawl Website" : mode === "images" ? "Scrape Images" : "Scrape HTML"}`}
							title="Mulai ekstraksi"
							className="btn-primary inline-flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-indigo disabled:cursor-not-allowed disabled:opacity-40 sm:size-12"
						>
							{pending ? (
								<Icon
									icon={Loading01Icon}
									size={18}
									aria-hidden
									className="motion-safe:animate-spin"
								/>
							) : (
								<Icon icon={ArrowUp01Icon} size={18} aria-hidden />
							)}
						</button>
					</div>
				</div>

				{hasAdvanced ? (
					<ScrapeWorkspaceAdvancedPanel
						mode={mode}
						open={advancedOpen}
						onToggle={() => setAdvancedOpen((open) => !open)}
						panelId={advancedPanelId}
						groups={groups}
						settings={activeSettings}
						issues={issues}
						urlRegex={crawl.urlRegex}
						onUrlRegexChange={(value) =>
							setCrawl({ ...crawl, urlRegex: value })
						}
						onNumberChange={updateNumber}
						onToggleChange={updateToggle}
						onSelectChange={(key, value) => {
							const parsed = designSettingsSchema.safeParse({
								...design,
								[key]: value,
							});
							if (parsed.success) setDesign(parsed.data);
						}}
						onReset={reset}
					/>
				) : null}
			</fieldset>
			{error ? (
				<p
					id="scrape-form-error"
					role="alert"
					className="mt-3 text-sm text-crimson"
				>
					{error}
				</p>
			) : null}
		</form>
	);
}
