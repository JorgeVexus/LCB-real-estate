import type { DescriptionSection } from "@/lib/description-sections";

export type FichaVariant = "3-fotos" | "2-fotos";

export interface FichaAgent {
  name: string;
  phone: string;
  email: string;
}

export interface FichaImage {
  id: string;
  url: string;
}

export interface FichaLocation {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Todo lo que aparece en la ficha, editable de punta a punta por el asesor
 * antes de exportar. Es la única forma de datos que consumen tanto el
 * editor/preview en pantalla como el render del PDF — "lo que ves es lo que
 * se exporta".
 */
export interface FichaData {
  publicId: string;
  variant: FichaVariant;

  title: string;
  agent: FichaAgent;

  /** Todas las fotos disponibles de la propiedad, para elegir en el PhotoPicker. */
  allImages: FichaImage[];
  heroImageId: string | null;
  /** 1 o 2 fotos según variant. */
  secondaryImageIds: string[];
  /** Hasta 6 fotos para la galería de la página 2. */
  galleryImageIds: string[];

  priceLabel: string;
  priceOperation: "en Renta" | "en Venta" | string;
  maintenanceLabel: string | null;
  areaLabel: string;
  extraHeadline: string | null;

  location: FichaLocation;
  mapEmbedUrl: string | null;
  googleMapsUrl: string | null;

  descriptionSections: DescriptionSection[];

  ctaText: string;
}
