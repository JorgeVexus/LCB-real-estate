"use client";

import { useState } from "react";
import type { FichaData } from "@/types/ficha";
import type { DescriptionBullet } from "@/lib/description-sections";
import { deriveLocationFromMapsUrl } from "@/lib/map";
import { AGENTS } from "@/lib/agents";
import { GARANTIA_OPTIONS } from "@/lib/garantia-options";

const sectionStyle: React.CSSProperties = { marginBottom: 20 };
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "-0.005em",
  marginBottom: 10,
};
const rowStyle: React.CSSProperties = { marginBottom: 10 };

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <label className="app-label">{label}</label>
      <input className="app-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function moveItem<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function PropertyForm({
  ficha,
  onChange,
}: {
  ficha: FichaData;
  onChange: (next: FichaData) => void;
}) {
  const [mapImageFileName, setMapImageFileName] = useState<string | null>(null);

  function set<K extends keyof FichaData>(key: K, value: FichaData[K]) {
    onChange({ ...ficha, [key]: value });
  }

  function updateBullet(sectionKey: string, index: number, bullet: DescriptionBullet) {
    const sections = ficha.descriptionSections.map((s) =>
      s.key === sectionKey
        ? { ...s, bullets: s.bullets.map((b, i) => (i === index ? bullet : b)) }
        : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  function removeBullet(sectionKey: string, index: number) {
    const sections = ficha.descriptionSections.map((s) =>
      s.key === sectionKey ? { ...s, bullets: s.bullets.filter((_, i) => i !== index) } : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  function addBullet(sectionKey: string) {
    const sections = ficha.descriptionSections.map((s) =>
      s.key === sectionKey ? { ...s, bullets: [...s.bullets, { label: "", value: "" }] } : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  function renameSection(sectionKey: string, title: string) {
    const sections = ficha.descriptionSections.map((s) => (s.key === sectionKey ? { ...s, title } : s));
    onChange({ ...ficha, descriptionSections: sections });
  }

  function moveBullet(sectionKey: string, index: number, dir: -1 | 1) {
    const sections = ficha.descriptionSections.map((s) =>
      s.key === sectionKey ? { ...s, bullets: moveItem(s.bullets, index, dir) } : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  // Solo actualiza el texto mientras el asesor escribe/pega -- barato, sin red.
  function setMapsUrlText(url: string) {
    set("googleMapsUrl", url);
  }

  // Al salir del campo (paste completo) sí intenta actualizar mapa/dirección.
  // Si la URL no trae coordenadas visibles (típico de un link corto
  // "maps.app.goo.gl" compartido desde el celular), resuelve la
  // redirección en el servidor antes de tirar la toalla.
  async function resolveMapsUrl(url: string) {
    if (!url.trim()) return;
    let derived = deriveLocationFromMapsUrl(url);

    if (!derived.embedUrl) {
      try {
        const res = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const { finalUrl } = await res.json();
          if (finalUrl) derived = deriveLocationFromMapsUrl(finalUrl);
        }
      } catch {
        // Sin conexión o link no resoluble: se deja tal cual, editable a mano.
      }
    }

    onChange({
      ...ficha,
      mapEmbedUrl: derived.embedUrl ?? ficha.mapEmbedUrl,
      customMapImage: derived.embedUrl ? null : ficha.customMapImage,
      location: derived.address ? { ...ficha.location, address: derived.address } : ficha.location,
    });
  }

  function handleMapImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("customMapImage", reader.result as string);
    reader.readAsDataURL(file);
    setMapImageFileName(file.name);
    e.target.value = "";
  }

  function clearMapImage() {
    set("customMapImage", null);
    setMapImageFileName(null);
  }

  function setAgentPreset(name: string) {
    const preset = AGENTS.find((a) => a.name === name);
    if (!preset) return;
    set("agent", { name: preset.name, phone: preset.phone, email: preset.email });
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Datos generales</div>
        <Field label="Título" value={ficha.title} onChange={(v) => set("title", v)} />
        <div style={rowStyle}>
          <label className="app-label">Variante de fotos (página 1)</label>
          <select
            className="app-input"
            value={ficha.variant}
            onChange={(e) => set("variant", e.target.value as FichaData["variant"])}
          >
            <option value="3-fotos">3 fotos (portada + 2)</option>
            <option value="2-fotos">2 fotos (portada + 1)</option>
          </select>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Asesor</div>
        <div style={rowStyle}>
          <label className="app-label">Selección rápida</label>
          <select className="app-input" value="" onChange={(e) => setAgentPreset(e.target.value)}>
            <option value="" disabled>
              Elegir asesor...
            </option>
            {AGENTS.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Nombre" value={ficha.agent.name} onChange={(v) => set("agent", { ...ficha.agent, name: v })} />
        <Field
          label="Teléfono"
          value={ficha.agent.phone}
          onChange={(v) => set("agent", { ...ficha.agent, phone: v })}
        />
        <Field
          label="Email"
          value={ficha.agent.email}
          onChange={(v) => set("agent", { ...ficha.agent, email: v })}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Precio y medidas</div>
        <Field label="Precio" value={ficha.priceLabel} onChange={(v) => set("priceLabel", v)} />
        <div style={rowStyle}>
          <label className="app-label">Operación</label>
          <select
            className="app-input"
            value={ficha.priceOperation}
            onChange={(e) => set("priceOperation", e.target.value)}
          >
            <option value="en Renta">en Renta</option>
            <option value="en Venta">en Venta</option>
          </select>
        </div>
        <Field
          label="Mantenimiento"
          value={ficha.maintenanceLabel ?? ""}
          onChange={(v) => set("maintenanceLabel", v || null)}
        />
        <Field label="Área (m²)" value={ficha.areaLabel} onChange={(v) => set("areaLabel", v)} />
        <Field
          label="Texto destacado (ej. 8 andenes para trailers)"
          value={ficha.extraHeadline ?? ""}
          onChange={(v) => set("extraHeadline", v || null)}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Ubicación</div>
        <div style={rowStyle}>
          <label className="app-label">Link de Google Maps</label>
          <input
            className="app-input"
            value={ficha.googleMapsUrl ?? ""}
            onChange={(e) => setMapsUrlText(e.target.value)}
            onBlur={(e) => resolveMapsUrl(e.target.value)}
          />
        </div>
        <Field
          label="Dirección visible (debajo del mapa)"
          value={ficha.location.address}
          onChange={(v) => set("location", { ...ficha.location, address: v })}
        />
        <p style={{ fontSize: 11, color: "var(--lcb-gray-text)", marginTop: -4, marginBottom: 10 }}>
          Al pegar otro link de Google Maps (completo o corto) se intenta actualizar la dirección y
          la imagen del mapa solos al salir del campo — si no queda bien, edítala a mano.
        </p>
        <div style={rowStyle}>
          <label className="app-label">Imagen de mapa personalizada (opcional)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label className="app-btn app-btn-secondary" style={{ cursor: "pointer" }}>
              Elegir imagen
              <input
                type="file"
                accept="image/*"
                onChange={handleMapImageUpload}
                style={{ display: "none" }}
              />
            </label>
            <span style={{ fontSize: 12, color: "var(--lcb-gray-text)" }}>
              {mapImageFileName ?? (ficha.customMapImage ? "Imagen cargada" : "Ningún archivo seleccionado")}
            </span>
          </div>
          {ficha.customMapImage && (
            <button
              type="button"
              className="app-btn app-btn-secondary"
              style={{ marginTop: 8, fontSize: 12, padding: "6px 12px" }}
              onClick={clearMapImage}
            >
              Quitar imagen y volver al mapa automático
            </button>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Página 2</div>
        <Field
          label="Título de la galería"
          value={ficha.galleryTitle}
          onChange={(v) => set("galleryTitle", v)}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Descarga</div>
        <Field
          label="Nombre del archivo al descargar"
          value={ficha.fileName}
          onChange={(v) => set("fileName", v)}
        />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Pie de página</div>
        <Field label="Texto del CTA" value={ficha.ctaText} onChange={(v) => set("ctaText", v)} />
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Descripción</div>
        {ficha.descriptionSections.map((section) => (
          <div
            key={section.key}
            className="app-card"
            style={{ marginBottom: 12, padding: 12 }}
          >
            <input
              className="app-input"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--lcb-gray-text)",
                marginBottom: 8,
                padding: "6px 8px",
                textTransform: "uppercase",
              }}
              value={section.title}
              onChange={(e) => renameSection(section.key, e.target.value)}
            />
            {section.bullets.map((bullet, i) => (
              <div key={i} style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button
                    type="button"
                    className="app-btn app-btn-secondary"
                    style={{ padding: "0 8px", fontSize: 10 }}
                    onClick={() => moveBullet(section.key, i, -1)}
                    disabled={i === 0}
                    aria-label="Mover arriba"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn-secondary"
                    style={{ padding: "0 8px", fontSize: 10 }}
                    onClick={() => moveBullet(section.key, i, 1)}
                    disabled={i === section.bullets.length - 1}
                    aria-label="Mover abajo"
                  >
                    ↓
                  </button>
                </div>
                <input
                  className="app-input"
                  style={{ flex: 1 }}
                  placeholder="Etiqueta"
                  value={bullet.label}
                  onChange={(e) => updateBullet(section.key, i, { ...bullet, label: e.target.value })}
                />
                <input
                  className="app-input"
                  style={{ flex: 1 }}
                  placeholder="Valor"
                  value={bullet.value}
                  onChange={(e) => updateBullet(section.key, i, { ...bullet, value: e.target.value })}
                />
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  style={{ padding: "0 12px" }}
                  onClick={() => removeBullet(section.key, i)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="app-btn app-btn-secondary"
              style={{ marginTop: 4, fontSize: 12, padding: "6px 12px" }}
              onClick={() => addBullet(section.key)}
            >
              + Agregar
            </button>

            {section.key === "REQUISITOS" && (
              <div style={{ marginTop: 10 }}>
                <label className="app-label">Garantía</label>
                <select
                  className="app-input"
                  value={ficha.garantiaOption}
                  onChange={(e) => set("garantiaOption", e.target.value)}
                >
                  {GARANTIA_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
