"use client";

import type { FichaData } from "@/types/ficha";

const MAX_GALLERY = 6;

function maxSecondary(variant: FichaData["variant"]): number {
  return variant === "3-fotos" ? 2 : 1;
}

function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function PhotoPicker({
  ficha,
  onChange,
}: {
  ficha: FichaData;
  onChange: (next: FichaData) => void;
}) {
  const maxSec = maxSecondary(ficha.variant);

  function setHero(id: string) {
    onChange({ ...ficha, heroImageId: id });
  }

  function toggleSecondary(id: string) {
    const has = ficha.secondaryImageIds.includes(id);
    if (has) {
      onChange({ ...ficha, secondaryImageIds: ficha.secondaryImageIds.filter((i) => i !== id) });
    } else if (ficha.secondaryImageIds.length < maxSec) {
      onChange({ ...ficha, secondaryImageIds: [...ficha.secondaryImageIds, id] });
    }
  }

  function toggleGallery(id: string) {
    const has = ficha.galleryImageIds.includes(id);
    if (has) {
      onChange({ ...ficha, galleryImageIds: ficha.galleryImageIds.filter((i) => i !== id) });
    } else if (ficha.galleryImageIds.length < MAX_GALLERY) {
      onChange({ ...ficha, galleryImageIds: [...ficha.galleryImageIds, id] });
    }
  }

  function reorderGallery(index: number, dir: -1 | 1) {
    onChange({ ...ficha, galleryImageIds: moveItem(ficha.galleryImageIds, index, dir) });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.005em", marginBottom: 4 }}>
        Fotos
      </div>
      <p style={{ fontSize: 12, color: "var(--lcb-gray-text)", marginBottom: 10 }}>
        Portada: 1 · Secundarias: {ficha.secondaryImageIds.length}/{maxSec} · Galería:{" "}
        {ficha.galleryImageIds.length}/{MAX_GALLERY}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8 }}>
        {ficha.allImages.map((img) => {
          const isHero = ficha.heroImageId === img.id;
          const isSecondary = ficha.secondaryImageIds.includes(img.id);
          const isGallery = ficha.galleryImageIds.includes(img.id);
          return (
            <div key={img.id} className="app-card" style={{ padding: 6 }}>
              <img
                src={img.url}
                alt=""
                style={{ width: "100%", height: 74, objectFit: "cover", borderRadius: 4 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, fontSize: 11 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="radio" checked={isHero} onChange={() => setHero(img.id)} /> Portada
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={isSecondary} onChange={() => toggleSecondary(img.id)} />{" "}
                  Secundaria
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={isGallery} onChange={() => toggleGallery(img.id)} /> Galería
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {ficha.galleryImageIds.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--lcb-gray-text)", marginBottom: 6 }}>
            Orden de la galería
          </div>
          <ol style={{ fontSize: 12, listStyle: "none" }}>
            {ficha.galleryImageIds.map((id, i) => (
              <li key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ flex: 1, color: "var(--lcb-gray-text)" }}>{id}</span>
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => reorderGallery(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => reorderGallery(i, 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
