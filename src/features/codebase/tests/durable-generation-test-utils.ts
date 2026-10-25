export const dbState = {
	selectRows: [] as unknown[],
	insertRows: [] as unknown[],
	updateRows: [] as unknown[],
	queries: [] as { type: string; values?: unknown; where?: unknown }[],
};

export type MockQueryChain = Promise<unknown[]> & {
	from: (table?: unknown) => MockQueryChain;
	where: (w: unknown) => MockQueryChain;
	orderBy: (o?: unknown) => MockQueryChain;
	limit: (n?: number) => MockQueryChain;
	for: (lock?: unknown, opts?: unknown) => MockQueryChain;
};

export type MockUpdateChain = Promise<unknown[]> & {
	set: (v: unknown) => MockUpdateChain;
	where: (w: unknown) => MockUpdateChain;
	returning: () => Promise<unknown[]>;
};

export function makeSelectChain(): MockQueryChain {
	const getResult = async () => {
		const next = dbState.selectRows.shift();
		return Array.isArray(next) ? next : next ? [next] : [];
	};
	const promise = getResult();
	const chain = Object.assign(promise, {
		from: () => chain,
		where: (w: unknown) => {
			dbState.queries.push({ type: "select-where", where: w });
			return chain;
		},
		orderBy: () => chain,
		limit: () => chain,
		for: () => chain,
	});
	return chain;
}

export function makeUpdateChain(): MockUpdateChain {
	let cached: unknown[] | null = null;
	const getRows = () => {
		if (cached === null) {
			const next = dbState.updateRows.shift();
			cached = Array.isArray(next) ? next : next ? [next] : [];
		}
		return cached;
	};
	const promise = Promise.resolve().then(() => getRows());
	const chain = Object.assign(promise, {
		set: (v: unknown) => {
			dbState.queries.push({ type: "update-set", values: v });
			return chain;
		},
		where: (w: unknown) => {
			dbState.queries.push({ type: "update-where", where: w });
			return chain;
		},
		returning: async () => getRows(),
	});
	return chain;
}

export function resetDbState(): void {
	dbState.selectRows = [];
	dbState.insertRows = [];
	dbState.updateRows = [];
	dbState.queries = [];
}
