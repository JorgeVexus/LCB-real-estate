import { NextResponse } from "next/server";
import { fetchPropertyDetail } from "@/lib/easybroker";
import { easyBrokerToFichaData } from "@/lib/ficha-mapper";
import { buildMapInfo } from "@/lib/map";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  const { publicId } = await params;

  try {
    const detail = await fetchPropertyDetail(publicId);
    const ficha = easyBrokerToFichaData(detail);
    const map = buildMapInfo(ficha.location.latitude, ficha.location.longitude);
    ficha.mapEmbedUrl = map.embedUrl;
    ficha.googleMapsUrl = map.googleMapsUrl;

    return NextResponse.json(ficha);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
