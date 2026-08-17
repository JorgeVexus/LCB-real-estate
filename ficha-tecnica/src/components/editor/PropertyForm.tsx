"use client";

import type { FichaData } from "@/types/ficha";
import type { DescriptionBullet } from "@/lib/description-sections";

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

export function PropertyForm({
  ficha,
  onChange,
}: {
  ficha: FichaData;
  onChange: (next: FichaData) => void;
}) {
  function set<K extends keyof FichaData>(key: K, value: FichaData[K]) {
    onChange({ ...ficha, [key]: value });
  }

  function updateBullet(sectionTitle: string, index: number, bullet: DescriptionBullet) {
    const sections = ficha.descriptionSections.map((s) =>
      s.title === sectionTitle
        ? { ...s, bullets: s.bullets.map((b, i) => (i === index ? bullet : b)) }
        : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  function removeBullet(sectionTitle: string, index: number) {
    const sections = ficha.descriptionSections.map((s) =>
      s.title === sectionTitle ? { ...s, bullets: s.bullets.filter((_, i) => i !== index) } : s
    );
    onChange({ ...ficha, descriptionSections: sections });
  }

  function addBullet(sectionTitle: string) {
    const sections = ficha.descriptionSections.map((s) =>
      s.title === sectionTitle ? { ...s, bullets: [...s.bullets, { label: "", value: "" }] } : s
    );
    onChange({ ...ficha, descriptionSections: sections });
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
        <Field
          label="Dirección visible"
          value={ficha.location.address}
          onChange={(v) => set("location", { ...ficha.location, address: v })}
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
            key={section.title}
            className="app-card"
            style={{ marginBottom: 12, padding: 12 }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--lcb-gray-text)", marginBottom: 8 }}>
              {section.title}
            </div>
            {section.bullets.map((bullet, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  className="app-input"
                  style={{ flex: 1 }}
                  placeholder="Etiqueta"
                  value={bullet.label}
                  onChange={(e) => updateBullet(section.title, i, { ...bullet, label: e.target.value })}
                />
                <input
                  className="app-input"
                  style={{ flex: 1 }}
                  placeholder="Valor"
                  value={bullet.value}
                  onChange={(e) => updateBullet(section.title, i, { ...bullet, value: e.target.value })}
                />
                <button
                  type="button"
                  className="app-btn app-btn-secondary"
                  style={{ padding: "0 12px" }}
                  onClick={() => removeBullet(section.title, i)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="app-btn app-btn-secondary"
              style={{ marginTop: 4, fontSize: 12, padding: "6px 12px" }}
              onClick={() => addBullet(section.title)}
            >
              + Agregar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
