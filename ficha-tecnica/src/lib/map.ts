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

const COORD_RE = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
const PLACE_RE = /\/maps\/place\/([^/@]+)/;

/**
 * Best-effort: si el asesor pega otro link de Google Maps, intenta sacar de
 * ahí un texto de dirección legible y un embed nuevo, para no tener que
 * escribir todo a mano. No funciona con links acortados (maps.app.goo.gl)
 * porque esos requieren resolver una redirección — en ese caso ninguno de
 * los dos campos se actualiza solo y el asesor los edita a mano.
 */
export function deriveLocationFromMapsUrl(url: string): {
  address: string | null;
  embedUrl: string | null;
} {
  let address: string | null = null;
  let embedUrl: string | null = null;

  const placeMatch = url.match(PLACE_RE);
  if (placeMatch) {
    address = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
  } else {
    try {
      const q = new URL(url).searchParams.get("q");
      if (q && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(q)) {
        address = decodeURIComponent(q.replace(/\+/g, " "));
      }
    } catch {
      // URL inválida o incompleta mientras el asesor todavía está escribiendo.
    }
  }

  const coordMatch = url.match(COORD_RE);
  if (coordMatch) {
    embedUrl = `https://www.google.com/maps?q=${coordMatch[1]},${coordMatch[2]}&z=15&output=embed`;
  } else if (/^https?:\/\/(www\.)?google\.[a-z.]+\/maps/.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    embedUrl = `${url}${sep}output=embed`;
  }

  return { address, embedUrl };
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
