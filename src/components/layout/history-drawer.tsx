"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { parseHistoryHref } from "@/lib/flow-progress";
import { loadHistory } from "@/lib/history";
import { HistoryContentView } from "./history-drawer/history-content-view";
import { HistoryDrawerShell } from "./history-drawer/history-drawer-shell";
import {
	classifyHistoryFailure,
	toDrawerItems,
} from "./history-drawer/history-formatters";
import {
	ANONYMOUS_VIEWER,
	type CategoryFilter,
	type DrawerHistoryItem,
	EMPTY_STATE_BY_FILTER,
	type HistoryDrawerProps,
	NO_MATCH_MESSAGE,
} from "./history-drawer/history-types";

export { toDrawerItems } from "./history-drawer/history-formatters";
export type {
	DrawerCategory,
	DrawerHistoryItem,
	HistoryDrawerProps,
} from "./history-drawer/history-types";

export function HistoryDrawer({
	isOpen,
	onClose,
	override,
}: HistoryDrawerProps) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<CategoryFilter>("all");
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	// The client cache outlives signOut(), so every viewer needs a separate key.
	const viewerId = session?.user?.id ?? ANONYMOUS_VIEWER;

	const historyQuery = useQuery({
		queryKey: ["drawer-history", viewerId],
		queryFn: () => loadHistory(),
		enabled: isOpen && !override,
		staleTime: 30_000,
	});

	const remoteItems = useMemo(
		() => (historyQuery.data ? toDrawerItems(historyQuery.data.items) : []),
		[historyQuery.data],
	);

	const allItems = override ? override.items : remoteItems;
	const loading = override
		? (override.isLoading ?? false)
		: isOpen && historyQuery.isLoading;
	// A failed background refetch must not replace an already-loaded list.
	const failed =
		!override && historyQuery.isError && historyQuery.data === undefined;
	const staleAfterFailure =
		!override && historyQuery.isError && historyQuery.data !== undefined;
	const failure = failed ? classifyHistoryFailure(historyQuery.error) : null;

	const visibleItems = useMemo(() => {
		const term = query.trim().toLowerCase();
		return allItems.filter((item) => {
			if (category !== "all" && item.type !== category) return false;
			if (!term) return true;
			return item.name.toLowerCase().includes(term);
		});
	}, [allItems, query, category]);

	const openItem = (item: DrawerHistoryItem) => {
		const target = parseHistoryHref(item.url);
		onClose();
		if (target) navigate(target);
	};

	const emptyMessage =
		query.trim().length > 0
			? NO_MATCH_MESSAGE
			: EMPTY_STATE_BY_FILTER[category];

	return (
		<HistoryDrawerShell
			isOpen={isOpen}
			onClose={onClose}
			allItemsCount={allItems.length}
			failed={failed}
			query={query}
			onQueryChange={setQuery}
			category={category}
			onCategoryChange={setCategory}
			visibleCount={visibleItems.length}
		>
			<HistoryContentView
				staleAfterFailure={staleAfterFailure}
				failed={failed}
				failure={failure}
				loading={loading}
				visibleItems={visibleItems}
				emptyMessage={emptyMessage}
				onClose={onClose}
				onRetry={() => {
					void historyQuery.refetch();
				}}
				isFetching={historyQuery.isFetching}
				onSelect={openItem}
			/>
		</HistoryDrawerShell>
	);
}
