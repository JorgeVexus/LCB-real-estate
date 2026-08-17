/** Acepta un ID de EasyBroker ("EB-XXXXXX") o cualquier URL que lo contenga. */
export function extractPublicId(input: string): string | null {
  const match = input.trim().match(/EB-[A-Za-z0-9]+/i);
  return match ? match[0].toUpperCase() : null;
}
