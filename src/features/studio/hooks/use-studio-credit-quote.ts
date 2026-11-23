"use client";

import { useEffect, useState } from "react";
import { loadStudioQuote } from "../services/studio-credit.functions";
import type {
	StudioQuoteScope,
	StudioQuoteView,
} from "../services/studio-credit-policy";

/** Returns a server-authoritative estimate; null means no label is shown. */
export function useStudioCreditQuote(
	scope: StudioQuoteScope | null,
): StudioQuoteView | null {
	const [view, setView] = useState<StudioQuoteView | null>(null);

	useEffect(() => {
		if (scope === null) {
			setView(null);
			return;
		}
		let active = true;
		void loadStudioQuote({ data: scope })
			.then((result) => {
				if (active) setView(result);
			})
			.catch(() => {
				if (active) setView(null);
			});
		return () => {
			active = false;
		};
	}, [scope]);

	return view;
}
