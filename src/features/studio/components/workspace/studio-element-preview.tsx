import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { useStudioElementEditing } from "../../hooks/use-studio-element-editing";
import { STUDIO_VISUAL_WIDTH } from "../../types/studio-constants";
import { StudioElementSurface } from "../canvas/studio-element-surface";

export function StudioElementPreview({
	editing,
	projectId,
	viewport,
}: {
	editing: ReturnType<typeof useStudioElementEditing>;
	projectId: string;
	viewport: string;
}) {
	const row = editing.preview;
	const width = STUDIO_VISUAL_WIDTH[viewport === "mobile" ? "mobile" : "web"];
	return (
		<Dialog
			open={Boolean(row)}
			onOpenChange={(open) => {
				if (!open && row && !editing.busy)
					void editing.transition(row, "cancel");
			}}
		>
			<DialogContent
				hideCloseButton
				className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] sm:max-w-6xl flex-col overflow-hidden rounded-xl p-4 sm:p-6"
				onEscapeKeyDown={(event) => {
					if (editing.busy) event.preventDefault();
				}}
				onPointerDownOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="font-medium">Preview Perubahan</DialogTitle>
					<DialogDescription>
						{row
							? `${row.frameName} / ${row.target.label}. Hanya elemen ini yang diubah. Perubahan belum diterapkan.`
							: ""}
					</DialogDescription>
				</DialogHeader>
				{row?.status === "generating" ? (
					<output className="py-8 text-sm text-fog">
						Permintaan pratinjau sedang diproses. Muat status untuk melihat
						hasilnya.
					</output>
				) : row ? (
					<>
						<p className="text-sm text-snow">{row.summary}</p>
						<div className="grid min-h-0 flex-1 gap-4 overflow-auto md:grid-cols-2">
							{(["before", "after"] as const).map((side) => (
								<div key={side} className="min-w-0">
									<p className="mb-2 text-xs font-medium text-fog">
										{side === "before" ? "Sebelum" : "Usulan"}
									</p>
									<div className="h-[min(55dvh,36rem)] overflow-auto rounded-lg border border-graphite">
										<div className="h-full" style={{ width }}>
											<StudioElementSurface
												projectId={projectId}
												frameId={row.frameId}
												baseRevision={row.baseRevision}
												name={row.frameName}
												revisionId={row.id}
												side={side}
											/>
										</div>
									</div>
								</div>
							))}
						</div>
					</>
				) : null}
				{editing.error ? (
					<p role="alert" className="text-sm text-crimson">
						{editing.error}
					</p>
				) : null}
				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						className="min-h-11"
						disabled={editing.busy}
						onClick={() => row && void editing.transition(row, "cancel")}
					>
						Batalkan
					</Button>
					{row?.status === "generating" ? (
						<Button
							className="min-h-11"
							disabled={editing.busy}
							onClick={() => void editing.refresh()}
						>
							Muat status
						</Button>
					) : (
						<Button
							className="min-h-11"
							disabled={editing.busy || row?.status !== "preview"}
							onClick={() => row && void editing.transition(row, "apply")}
						>
							{editing.busy ? "Menyimpan perubahan" : "Terapkan"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
