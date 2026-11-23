import { createServerFn } from "@tanstack/react-start";
import { CREDIT_OPERATION_REGISTRY } from "./credit-operation-registry";

export interface ProductChargingState {
	studio: boolean;
	scrape: boolean;
}

type ChargingEnv = Readonly<{
	STUDIO_CREDIT_CHARGING_ENABLED?: string;
	SCRAPE_CREDIT_CHARGING_ENABLED?: string;
}>;

/**
 * Public copy follows the same gate as charging itself: the rollout flag AND
 * a configured tariff. An unconfigured operation cannot be quoted, so it must
 * never be advertised as an active credit charge.
 */
export function resolveProductChargingState(
	env: ChargingEnv,
): ProductChargingState {
	const hasConfiguredTariff = (prefix: string) =>
		Object.entries(CREDIT_OPERATION_REGISTRY).some(
			([kind, definition]) =>
				kind.startsWith(prefix) && definition.pricing.status === "configured",
		);

	return {
		studio:
			env.STUDIO_CREDIT_CHARGING_ENABLED === "true" &&
			hasConfiguredTariff("studio."),
		scrape:
			env.SCRAPE_CREDIT_CHARGING_ENABLED === "true" &&
			hasConfiguredTariff("scrape."),
	};
}

export const loadChargingState = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ productChargingEnabled: ProductChargingState }> => ({
		productChargingEnabled: resolveProductChargingState(process.env),
	}),
);
