"use client";

import type { FichaData } from "@/types/ficha";

const MAX_GALLERY = 6;

type Role = "none" | "hero" | "secondary" | "gallery";

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

function roleOf(ficha: FichaData, id: string): Role {
  if (ficha.heroImageId === id) return "hero";
  if (ficha.secondaryImageIds.includes(id)) return "secondary";
  if (ficha.galleryImageIds.includes(id)) return "gallery";
  return "none";
}

export function PhotoPicker({
  ficha,
  onChange,
}: {
  ficha: FichaData;
  onChange: (next: FichaData) => void;
}) {
  const maxSec = maxSecondary(ficha.variant);

  // Cada foto es portada, secundaria, galería o ninguna -- nunca dos roles
  // a la vez. Elegir un rol nuevo la saca automáticamente de cualquier otro.
  function setRole(id: string, role: Role) {
    let heroImageId = ficha.heroImageId === id ? null : ficha.heroImageId;
    let secondaryImageIds = ficha.secondaryImageIds.filter((i) => i !== id);
    let galleryImageIds = ficha.galleryImageIds.filter((i) => i !== id);

    if (role === "hero") {
      heroImageId = id;
    } else if (role === "secondary" && secondaryImageIds.length < maxSec) {
      secondaryImageIds = [...secondaryImageIds, id];
    } else if (role === "gallery" && galleryImageIds.length < MAX_GALLERY) {
      galleryImageIds = [...galleryImageIds, id];
    }

    onChange({ ...ficha, heroImageId, secondaryImageIds, galleryImageIds });
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
        Cada foto es portada, secundaria o galería -- nunca dos a la vez. Portada: 1 · Secundarias:{" "}
        {ficha.secondaryImageIds.length}/{maxSec} · Galería: {ficha.galleryImageIds.length}/{MAX_GALLERY}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8 }}>
        {ficha.allImages.map((img) => {
          const role = roleOf(ficha, img.id);
          const secondaryFull = ficha.secondaryImageIds.length >= maxSec && role !== "secondary";
          const galleryFull = ficha.galleryImageIds.length >= MAX_GALLERY && role !== "gallery";
          return (
            <div key={img.id} className="app-card" style={{ padding: 6 }}>
              <img
                src={img.url}
                alt=""
                style={{ width: "100%", height: 74, objectFit: "cover", borderRadius: 4 }}
              />
              <select
                className="app-input"
                style={{ marginTop: 6, fontSize: 11, padding: "4px 6px" }}
                value={role}
                onChange={(e) => setRole(img.id, e.target.value as Role)}
              >
                <option value="none">Ninguna</option>
                <option value="hero">Portada</option>
                <option value="secondary" disabled={secondaryFull}>
                  Secundaria
                </option>
                <option value="gallery" disabled={galleryFull}>
                  Galería
                </option>
              </select>
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
