import type { DescriptionSection } from "@/lib/description-sections";

const LEFT_COLUMN = new Set(["PRECIO", "MEDIDAS", "CARGA Y DESCARGA"]);

function Section({ section, extraBullet }: { section: DescriptionSection; extraBullet?: string | null }) {
  if (section.bullets.length === 0 && !extraBullet) return null;
  return (
    <div className="ficha-desc-section">
      <div className="ficha-desc-section-title">{section.title}</div>
      {section.bullets.map((b, i) => (
        <div className="ficha-desc-bullet" key={i}>
          · {b.label}: {b.value}
        </div>
      ))}
      {extraBullet && <div className="ficha-desc-bullet">· Garantía: {extraBullet}</div>}
    </div>
  );
}

export function FichaDescription({
  sections,
  garantiaOption,
}: {
  sections: DescriptionSection[];
  garantiaOption?: string | null;
}) {
  const left = sections.filter((s) => LEFT_COLUMN.has(s.title));
  const right = sections.filter((s) => !LEFT_COLUMN.has(s.title));

  return (
    <div className="ficha-description">
      <div className="ficha-description-title">Descripción</div>
      <div className="ficha-description-columns">
        <div>
          {left.map((s) => (
            <Section key={s.title} section={s} />
          ))}
        </div>
        <div>
          {right.map((s) => (
            <Section
              key={s.title}
              section={s}
              extraBullet={s.title === "REQUISITOS" ? garantiaOption : null}
            />
          ))}
          <div className="ficha-desc-note">*El precio puede cambiar sin aviso previo*.</div>
        </div>
      </div>
    </div>
  );
}
