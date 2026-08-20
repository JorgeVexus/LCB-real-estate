import type { EasyBrokerPropertyDetail } from "@/lib/easybroker";
import { parseDescriptionSections, type DescriptionSection } from "@/lib/description-sections";
import { matchGarantiaOption } from "@/lib/garantia-options";
import { formatMexPhone } from "@/lib/agents";
import type { FichaData, FichaVariant } from "@/types/ficha";

const DEFAULT_CTA = "AGENDA TU CITA CON 24 HRS. DE ANTICIPACIÓN PARA CONOCERLA.";

function formatAmount(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `$${formatted} ${currency}`;
}

function findBulletValue(
  sections: DescriptionSection[],
  sectionTitle: string,
  labelIncludes: string
): string | null {
  const section = sections.find((s) => s.title === sectionTitle);
  const bullet = section?.bullets.find((b) => b.label.toLowerCase().includes(labelIncludes));
  return bullet?.value ?? null;
}

export function easyBrokerToFichaData(detail: EasyBrokerPropertyDetail): FichaData {
  const { sections, garantiaText } = parseDescriptionSections(detail.description ?? "");

  const images = detail.property_images.map((img, i) => ({
    id: `img-${i}`,
    url: img.url,
  }));

  const variant: FichaVariant = images.length >= 3 ? "3-fotos" : "2-fotos";
  const secondaryCount = variant === "3-fotos" ? 2 : 1;

  const saleOrRental = detail.operations.find((op) => op.type === "rental" || op.type === "sale");
  const priceLabel = saleOrRental
    ? saleOrRental.formatted_amount ?? formatAmount(saleOrRental.amount, saleOrRental.currency)
    : "Precio a consultar";
  const priceOperation = saleOrRental?.type === "sale" ? "en Venta" : "en Renta";

  const areaFromBullet = findBulletValue(sections, "MEDIDAS", "área total construida");
  const areaLabel = areaFromBullet
    ? /m2|m²/i.test(areaFromBullet)
      ? areaFromBullet.replace(/m2/i, "m²")
      : `${areaFromBullet} m²`
    : detail.construction_size
      ? `${detail.construction_size} m²`
      : detail.lot_size
        ? `${detail.lot_size} m²`
        : "";

  const maintenanceLabel = findBulletValue(sections, "PRECIO", "cuota de mantenimiento");

  const andenes = findBulletValue(sections, "CARGA Y DESCARGA", "andenes");
  const extraHeadline = andenes ? `${andenes} andenes para trailers` : null;

  return {
    publicId: detail.public_id,
    variant,

    title: detail.title,
    agent: {
      name: detail.agent?.full_name ?? detail.agent?.name ?? "",
      phone: formatMexPhone(detail.agent?.mobile_phone ?? ""),
      email: detail.agent?.email ?? "",
    },

    allImages: images,
    heroImageId: images[0]?.id ?? null,
    secondaryImageIds: images.slice(1, 1 + secondaryCount).map((img) => img.id),
    galleryImageIds: images.slice(0, 6).map((img) => img.id),

    priceLabel,
    priceOperation,
    maintenanceLabel,
    areaLabel,
    extraHeadline,

    location: {
      address: detail.location?.name ?? "",
      latitude: detail.location?.latitude ?? null,
      longitude: detail.location?.longitude ?? null,
    },
    mapEmbedUrl: null,
    googleMapsUrl: null,

    descriptionSections: sections,
    garantiaOption: matchGarantiaOption(garantiaText),

    galleryTitle: "Fotografías",
    ctaText: DEFAULT_CTA,
  };
}
