export interface AgentPreset {
  name: string;
  phone: string;
  email: string;
}

/** Asesores de LCB para el dropdown de selección rápida en el editor. */
export const AGENTS: AgentPreset[] = [
  { name: "Tulio Bado", phone: "+52 55 5105 9656", email: "tuliobg@lcb-realestate.com" },
  { name: "Lucy Barragán", phone: "+52 55 8792 0522", email: "lucy@lcb-realestate.com" },
  { name: "Chantalle Bado", phone: "+52 55 5106 8171", email: "bado@lcb-realestate.com" },
  { name: "Tulio A. Bado", phone: "+52 55 5507 7769", email: "tulio@lcb-realestate.com" },
  { name: "León Bado", phone: "+52 56 1076 6294", email: "leon@lcb-realestate.com" },
  { name: "Fernando Bado", phone: "+52 55 6911 3374", email: "fernando@lcb-realestate.com" },
];

/**
 * Da formato "+52 55 3016 2107" a un teléfono mexicano que venga pegado
 * (ej. lo que trae EasyBroker: "+525530162107"). Si no calza con el patrón
 * de 10 dígitos + código de país, regresa el original sin tocar -- mejor
 * mostrar el número tal cual que inventarle un formato equivocado.
 */
export function formatMexPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  const national =
    digits.length === 12 && digits.startsWith("52")
      ? digits.slice(2)
      : digits.length === 10
        ? digits
        : null;

  if (!national) return raw;
  return `+52 ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6, 10)}`;
}
