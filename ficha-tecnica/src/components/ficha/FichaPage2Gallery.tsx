import { FichaHeader } from "./FichaHeader";
import { FichaFooter } from "./FichaFooter";
import type { FichaData } from "@/types/ficha";

export function FichaPage2Gallery({ ficha, logoSrc }: { ficha: FichaData; logoSrc?: string }) {
  const photos = ficha.galleryImageIds
    .map((id) => ficha.allImages.find((img) => img.id === id)?.url)
    .filter(Boolean) as string[];

  return (
    <div className="ficha-page">
      <FichaHeader title="" agent={ficha.agent} logoSrc={logoSrc} />
      <div className="ficha-gallery-title">{ficha.galleryTitle}</div>
      <div className="ficha-gallery-grid">
        {photos.map((url, i) => (
          <div key={i}>
            <img src={url} alt="" />
          </div>
        ))}
      </div>
      <FichaFooter text={ficha.ctaText} />
    </div>
  );
}
