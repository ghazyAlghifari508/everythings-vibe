export function workspacePaymentSearch(search: Record<string, unknown>): {
	order_id?: string;
	payment?: string;
	transaction_status?: string;
	paywall?: string;
} {
	const result: {
		order_id?: string;
		payment?: string;
		transaction_status?: string;
		paywall?: string;
	} = {};
	if (typeof search.order_id === "string") result.order_id = search.order_id;
	if (typeof search.payment === "string") result.payment = search.payment;
	if (typeof search.transaction_status === "string")
		result.transaction_status = search.transaction_status;
	if (typeof search.paywall === "string") result.paywall = search.paywall;
	return result;
}
