import type { Provider } from "./schema.js";
import type { ProviderV2 } from "./schema-v2.js";

export function toProvidersV2(
  _providers: Record<string, Provider>,
): Record<string, ProviderV2> {
  // TODO(v2): Transform v1 providers and models into ProviderV2 / ModelV2 shape
  return {};
}
