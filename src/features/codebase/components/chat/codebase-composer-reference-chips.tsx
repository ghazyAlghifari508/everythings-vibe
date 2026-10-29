"use client";

import {
	Alert02Icon,
	Cancel01Icon,
	File01Icon,
	FileCodeIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { CodebaseArtifactRef } from "@/features/codebase/components/explorer/codebase-file-card";
import {
	type ComposerOperationMode,
	formatArtifactChipLabel,
	type ReconciledComposerReference,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";

interface CodebaseComposerReferenceChipsProps {
	mode: ComposerOperationMode;
	targetKind: RevisionTargetKind;
	targetArtifact: CodebaseArtifactRef | null;
	featureName?: string | null;
	references: readonly ReconciledComposerReference[];
	lockedNotice: string | null;
	onRemoveReference: (key: string) => void;
	onDismissNotice: () => void;
}

export function CodebaseComposerReferenceChips({
	mode,
	targetKind,
	targetArtifact,
	featureName,
	references,
	lockedNotice,
	onRemoveReference,
	onDismissNotice,
}: CodebaseComposerReferenceChipsProps) {
	const visibleReferences = references.filter((ref) => {
		if (
			mode === "revise" &&
			targetArtifact &&
			ref.binding.kind === "artifact" &&
			ref.binding.targetKind === targetKind
		) {
			return false;
		}
		return true;
	});

	const matchingTargetRef = references.find(
		(ref) =>
			ref.binding.kind === "artifact" && ref.binding.targetKind === targetKind,
	);

	const showReviseTargetChip = mode === "revise" && targetArtifact !== null;
	const showMissingTargetNotice =
		mode === "revise" && targetArtifact === null && !matchingTargetRef;

	if (
		!showReviseTargetChip &&
		!showMissingTargetNotice &&
		visibleReferences.length === 0 &&
		!lockedNotice
	) {
		return null;
	}

	const targetChipLabel = targetArtifact
		? formatArtifactChipLabel(targetArtifact, targetKind, featureName)
		: null;

	return (
		<div
			data-testid="composer-reference-chips"
			data-composer-interactive="true"
			className="flex min-w-0 flex-wrap items-center gap-1.5"
		>
			{showReviseTargetChip && targetArtifact && targetChipLabel ? (
				<span
					data-testid="composer-target-artifact-chip"
					data-target-kind={targetKind}
					data-artifact-id={targetArtifact.id}
					className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-indigo/40 bg-indigo/15 px-2 py-0.5 text-[11px] font-medium text-snow"
				>
					<Icon
						icon={File01Icon}
						size={12}
						aria-hidden="true"
						className="shrink-0 text-indigo-300"
					/>
					<span className="truncate" title={targetChipLabel}>
						{targetChipLabel}
					</span>
					{matchingTargetRef ? (
						<button
							type="button"
							data-testid={`composer-reference-remove-${targetKind}`}
							aria-label={`Hapus referensi ${targetChipLabel}`}
							onClick={() => onRemoveReference(matchingTargetRef.key)}
							className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
						>
							<Icon icon={Cancel01Icon} size={11} aria-hidden="true" />
						</button>
					) : null}
				</span>
			) : null}

			{showMissingTargetNotice ? (
				<output
					data-testid="composer-missing-target-notice"
					className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200"
				>
					<Icon
						icon={Alert02Icon}
						size={12}
						aria-hidden="true"
						className="shrink-0"
					/>
					<span className="truncate">
						Pilih dokumen target yang tersedia (@PRD, @Feature, @AC, atau @Task)
					</span>
				</output>
			) : null}

			{visibleReferences.map((ref) => {
				const idSuffix =
					ref.binding.kind === "file"
						? ref.binding.path
						: ref.binding.targetKind;
				return (
					<span
						key={ref.key}
						data-testid={`composer-reference-chip-${idSuffix}`}
						data-reference-kind={ref.binding.kind}
						data-stale={!ref.available ? "true" : undefined}
						className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${
							ref.available
								? "border-graphite bg-obsidian text-snow"
								: "border-crimson/50 bg-crimson/10 text-crimson"
						}`}
					>
						<Icon
							icon={
								!ref.available
									? Alert02Icon
									: ref.binding.kind === "file"
										? FileCodeIcon
										: File01Icon
							}
							size={12}
							aria-hidden="true"
							className="shrink-0"
						/>
						<span className="max-w-52 truncate font-mono" title={ref.chipLabel}>
							{ref.chipLabel}
						</span>
						{ref.staleReason ? (
							<span
								data-testid={`composer-reference-stale-${idSuffix}`}
								className="shrink-0 text-[10px] font-medium text-crimson"
							>
								· {ref.staleReason}
							</span>
						) : null}
						<button
							type="button"
							data-testid={`composer-reference-remove-${idSuffix}`}
							aria-label={`Hapus referensi ${ref.chipLabel}`}
							onClick={() => onRemoveReference(ref.key)}
							className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-fog hover:text-snow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo"
						>
							<Icon icon={Cancel01Icon} size={11} aria-hidden="true" />
						</button>
					</span>
				);
			})}

			{lockedNotice ? (
				<output
					data-testid="composer-locked-notice"
					className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 py-0.5 text-[11px] text-fog"
				>
					<span className="truncate">{lockedNotice}</span>
					<button
						type="button"
						aria-label="Tutup pemberitahuan mode"
						onClick={onDismissNotice}
						className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate hover:text-snow"
					>
						<Icon icon={Cancel01Icon} size={11} aria-hidden="true" />
					</button>
				</output>
			) : null}
		</div>
	);
}
