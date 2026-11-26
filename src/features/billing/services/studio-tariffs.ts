import { createTariffRegistry } from "./pricing-policy";

/**
 * Production Studio tariffs are intentionally empty until the owner approves
 * exact rates and rollout. This is the only registry the Studio server may
 * quote from; an empty registry means "no disclosed price", never a zero price.
 */
export const STUDIO_TARIFF_REGISTRY = createTariffRegistry({
	id: "studio-inactive",
	tariffs: {},
	activeVersions: {},
});
