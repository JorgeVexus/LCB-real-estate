import { FichaHeader } from "./FichaHeader";
import { FichaFooter } from "./FichaFooter";
import { FichaDescription } from "./FichaDescription";
import type { FichaData } from "@/types/ficha";

function imageUrl(ficha: FichaData, id: string | null): string | null {
  return ficha.allImages.find((img) => img.id === id)?.url ?? null;
}

export function FichaPage1({ ficha, logoSrc }: { ficha: FichaData; logoSrc?: string }) {
  const hero = imageUrl(ficha, ficha.heroImageId);
  const secondary = ficha.secondaryImageIds.map((id) => imageUrl(ficha, id)).filter(Boolean) as string[];
  const isTwoPhoto = ficha.variant === "2-fotos";

  return (
    <div className="ficha-page">
      <FichaHeader title={ficha.title} agent={ficha.agent} logoSrc={logoSrc} />

      <div className="ficha-photo-row">
        <div className="ficha-hero-photo" style={isTwoPhoto ? { flexBasis: "61%" } : undefined}>
          {hero && <img src={hero} alt="" />}
        </div>
        <div className={`ficha-secondary-photos ${isTwoPhoto ? "one-up" : "two-up"}`}>
          {secondary.map((url, i) => (
            <div key={i}>
              <img src={url} alt="" />
            </div>
          ))}
        </div>
      </div>

      <div className="ficha-info-row">
        <div className="ficha-info-stack">
          <div className="ficha-price-block">
            <span className="ficha-price-amount">{ficha.priceLabel}</span>
            <span className="ficha-price-operation">{ficha.priceOperation}</span>
          </div>
          <div className="ficha-area-block">{ficha.areaLabel}</div>
          {ficha.maintenanceLabel && (
            <div className="ficha-maintenance-block">
              <span className="ficha-maintenance-caption">Mantenimiento: </span>
              {ficha.maintenanceLabel}
            </div>
          )}
          {ficha.extraHeadline && <div className="ficha-extra-headline">{ficha.extraHeadline}</div>}
        </div>

        {(ficha.mapEmbedUrl || ficha.googleMapsUrl) && (
          <div className="ficha-map-card">
            <div className="ficha-map-frame">
              {ficha.mapEmbedUrl ? (
                <iframe className="ficha-map-embed" src={ficha.mapEmbedUrl} loading="eager" title="Ubicación" />
              ) : (
                <div className="ficha-map-placeholder">Ver en Google Maps</div>
              )}
              {/* Overlay transparente: un <iframe> no genera un link real al
                  imprimir a PDF, así que este <a> encima es lo que Chromium
                  sí conserva como zona clicable en el PDF final. */}
              {ficha.googleMapsUrl && (
                <a
                  className="ficha-map-image-link"
                  href={ficha.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Ver en Google Maps"
                />
              )}
            </div>
            <div className="ficha-map-address">{ficha.location.address}</div>
          </div>
        )}
      </div>

      <FichaDescription sections={ficha.descriptionSections} />

      <FichaFooter text={ficha.ctaText} />
    </div>
  );
}
