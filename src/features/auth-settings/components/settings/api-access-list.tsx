import {
	ArrowDown01Icon,
	Eraser01Icon,
	Key01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ApiKeyRecord } from "../../types/api-key-contracts";
import { isObsoleteKey } from "../../types/api-key-record";
import { ApiKeysTable } from "./api-keys-table";

interface ApiAccessListProps {
	keys: ApiKeyRecord[];
	onRevoke: (id: string) => void;
	onCleanup: () => void;
}

/** The registered-access section: everything the list can truthfully say about
 * a credential comes from the row plus the server-computed lifecycle fields. */
export function ApiAccessList({
	keys,
	onRevoke,
	onCleanup,
}: ApiAccessListProps) {
	const obsoleteCount = keys.filter(isObsoleteKey).length;
	const automaticCount = keys.filter((k) => k.source === "automatic").length;

	return (
		<section aria-labelledby="access-list-heading" className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3
					id="access-list-heading"
					className="font-mono text-xs uppercase tracking-widest text-fog"
				>
					Akses yang terdaftar
				</h3>
				{obsoleteCount > 0 && (
					<Button
						variant="ghost"
						size="sm"
						onClick={onCleanup}
						className="gap-1.5"
					>
						<Icon icon={Eraser01Icon} size={14} />
						Bersihkan {obsoleteCount} akses usang
					</Button>
				)}
			</div>

			{keys.length === 0 ? (
				<div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-6 sm:p-8">
					<div className="flex items-start gap-3">
						<Icon
							icon={Key01Icon}
							size={18}
							className="mt-0.5 shrink-0 text-fog"
						/>
						<div className="space-y-1.5">
							<p className="text-sm font-medium text-snow">
								Belum ada akses terdaftar
							</p>
							<p className="max-w-prose text-xs leading-relaxed text-fog">
								Akses untuk AI Agent dibuat otomatis saat kamu memilih opsi
								serah-terima prompt agent di halaman Task. Akses muncul di sini
								setelah dibuat, tanpa perlu menyiapkan kredensial manual.
							</p>
							<p className="text-xs text-fog/70">
								Butuh kredensial khusus untuk integrasi sendiri? Buka pengaturan
								lanjutan di bawah.
							</p>
						</div>
					</div>
				</div>
			) : (
				<>
					<p className="text-xs leading-relaxed text-fog">
						Akses untuk AI Agent dibuat otomatis saat kamu menghubungkan
						integrasi. Kamu bisa memeriksa dan mencabut akses di sini.
						{automaticCount > 0 &&
							` ${automaticCount} dari ${keys.length} akses berasal dari serah-terima otomatis.`}
					</p>
					<ApiKeysTable keys={keys} onRevoke={onRevoke} />
				</>
			)}
		</section>
	);
}

/** Collapsed by default so manual credential generation never presents itself as
 * the primary action on a page whose job is reviewing access. */
export function ApiAdvancedSection({
	open,
	onToggle,
	children,
}: {
	open: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	return (
		<section className="min-w-0 rounded-lg border border-graphite">
			<h3 className="min-w-0">
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={open}
					aria-controls="api-keys-advanced-panel"
					className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span className="min-w-0">
						<span className="block text-sm font-semibold text-snow">
							Pengaturan lanjutan
						</span>
						<span className="mt-0.5 block text-xs text-fog">
							Buat API key manual untuk integrasi khusus.
						</span>
					</span>
					<Icon
						icon={ArrowDown01Icon}
						size={18}
						aria-hidden
						className={cn(
							"shrink-0 text-fog transition-transform motion-reduce:transition-none",
							open && "rotate-180",
						)}
					/>
				</button>
			</h3>
			{open ? (
				<div
					id="api-keys-advanced-panel"
					className="flex min-w-0 flex-col gap-4 border-t border-graphite p-4"
				>
					{children}
				</div>
			) : null}
		</section>
	);
}
