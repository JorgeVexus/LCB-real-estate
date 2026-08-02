import { WebflowItemSummary } from "./webflow";

/**
 * Suggests up to `limit` "similar properties" (Webflow item IDs) for a
 * property, since EasyBroker has no such concept — this is an editorial
 * pick the team used to make by hand. Matches on same property type + city
 * first, relaxing to property type only or city only if there aren't
 * enough candidates, then ranks by closeness in construction size (m²),
 * the one dimension comparable across currencies.
 */
export function suggestSimilarProperties(
  target: { id: string; propertyTypeId: string; cityId: string; metros: number },
  candidates: WebflowItemSummary[],
  limit = 4
): string[] {
  const live = candidates.filter((i) => !i.isDraft && !i.isArchived && i.id !== target.id);

  const sameTypeAndCity = live.filter(
    (i) => i.fieldData["property-type"] === target.propertyTypeId && i.fieldData.city === target.cityId
  );
  const sameType = live.filter((i) => i.fieldData["property-type"] === target.propertyTypeId);
  const sameCity = live.filter((i) => i.fieldData.city === target.cityId);

  const pool =
    sameTypeAndCity.length >= limit
      ? sameTypeAndCity
      : sameType.length >= limit
        ? sameType
        : sameCity.length >= limit
          ? sameCity
          : live;

  const ranked = [...pool].sort((a, b) => {
    const aMetros = parseFloat(String(a.fieldData["metros-cuadrados"] ?? "")) || 0;
    const bMetros = parseFloat(String(b.fieldData["metros-cuadrados"] ?? "")) || 0;
    return Math.abs(aMetros - target.metros) - Math.abs(bMetros - target.metros);
  });

  return ranked.slice(0, limit).map((i) => i.id);
}
