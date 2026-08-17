/**
 * Mapa embebido de Google Maps sin API key ni cuenta de facturación —
 * el mismo truco que ya usa lcb-realestate.com en sus fichas de propiedad
 * (`https://www.google.com/maps?q=lat,lng&output=embed`). Gratis, sin
 * tarjeta, sin registro.
 */
export interface MapInfo {
  embedUrl: string | null;
  googleMapsUrl: string | null;
}

export function buildMapInfo(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): MapInfo {
  if (latitude == null || longitude == null) {
    return { embedUrl: null, googleMapsUrl: null };
  }

  return {
    embedUrl: `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  };
}
