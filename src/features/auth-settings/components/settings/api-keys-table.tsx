import { Delete02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { ApiKeyRecord } from "../../types/api-key-contracts";

interface ApiKeysTableProps {
	keys: ApiKeyRecord[];
	onRevoke: (id: string) => void;
}

/**
 * `source`/`state` arrive precomputed from the server clock: an automatic key
 * without an expiry is the pre-policy handoff pile, while a manual key without
 * an expiry is long-lived on purpose. The label must not re-derive that from the
 * browser clock.
 */
function expiryLabel(key: ApiKeyRecord): { text: string; obsolete: boolean } {
	if (key.state === "expired") return { text: "Kedaluwarsa", obsolete: true };
	if (key.state === "no-expiry")
		return key.source === "automatic"
			? { text: "Usang", obsolete: true }
			: { text: "Never", obsolete: false };
	return {
		text: key.expires_at ? formatDate(key.expires_at) : "-",
		obsolete: false,
	};
}

/** Timestamps render in the product timezone, never the browser zone. */
function formatTimestamp(value: string | null): string {
	return value ? formatDateTime(value) : "Never";
}

function formatCreated(value: string): string {
	return value ? formatDate(value) : "-";
}

export function ApiKeysTable({ keys, onRevoke }: ApiKeysTableProps) {
	return (
		<div className="overflow-x-auto rounded-lg border border-(--border-subtle)">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-(--border-subtle) bg-(--bg-surface) text-left text-xs text-fog">
						<th className="px-4 py-3 font-medium">Nama</th>
						<th className="px-4 py-3 font-medium">Prefix</th>
						<th className="px-4 py-3 font-medium">Scopes</th>
						<th className="px-4 py-3 font-medium">Last Used</th>
						<th className="px-4 py-3 font-medium">Created</th>
						<th className="px-4 py-3 font-medium">Expires</th>
						<th className="px-4 py-3 text-right font-medium">Aksi</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-(--border-subtle)">
					{keys.map((key) => {
						const expiry = expiryLabel(key);
						return (
							<tr
								key={key.id}
								className="hover:bg-(--bg-surface)/50 transition-colors"
							>
								<td className="px-4 py-3">
									<div className="font-[510] text-snow">{key.name}</div>
									<div className="mt-0.5 text-[11px] text-fog/60">
										{key.source === "automatic"
											? "Handoff otomatis"
											: "Dibuat manual"}
									</div>
								</td>
								<td className="px-4 py-3 font-mono text-xs text-fog">
									{key.key_prefix}...
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-wrap gap-1">
										{(key.scopes || []).map((s) => (
											<span
												key={s}
												className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-fog"
											>
												{s}
											</span>
										))}
									</div>
								</td>
								<td className="px-4 py-3 text-xs text-fog whitespace-nowrap">
									{formatTimestamp(key.last_used_at)}
								</td>
								<td className="px-4 py-3 text-xs text-fog whitespace-nowrap">
									{formatCreated(key.created_at)}
								</td>
								<td
									className={`px-4 py-3 text-xs ${
										expiry.obsolete ? "text-crimson" : "text-fog"
									}`}
								>
									{expiry.text}
								</td>
								<td className="px-4 py-3 text-right">
									<Button
										variant="ghost"
										size="sm"
										aria-label={`Hapus key ${key.name}`}
										onClick={() => onRevoke(key.id)}
										className="text-crimson hover:bg-crimson/10"
									>
										<Icon icon={Delete02Icon} size={14} />
									</Button>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
