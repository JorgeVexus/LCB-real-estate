const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugifyFileName(text: string): string {
  const withoutDiacritics = text.normalize("NFD").replace(COMBINING_DIACRITICS, "");
  const slug = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "ficha";
}
