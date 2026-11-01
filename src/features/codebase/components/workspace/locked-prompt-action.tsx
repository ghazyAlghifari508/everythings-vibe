"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TopUpModal } from "@/features/billing/components/top-up-modal";

/**
 * The only action a locked prompt offers. It opens the real billing top-up
 * flow and re-reads server eligibility when it closes, so the prompt unlocks
 * from server state instead of an optimistic balance.
 */
export function LockedPromptAction({
	onEligibilityRefresh,
	label = "Tambahkan Kredit",
}: {
	onEligibilityRefresh?: () => void;
	label?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button type="button" onClick={() => setOpen(true)}>
				{label}
			</Button>
			<TopUpModal
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) onEligibilityRefresh?.();
				}}
			/>
		</>
	);
}
