import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const APP_ID = process.env.ALGOLIA_APP_ID;
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const INDEX = process.env.ALGOLIA_INDEX_NAME;

// Known option-ID -> display-name lookups (from the Webflow Propiedades collection schema).
const CURRENCY_NAMES = { "fdd254535cf1c1c46439688f3fc38b56": "MXN", "70428151ca597e56d3dba02463a266ed": "USD" };
const OPERATION_NAMES = { "5d3f07913172b9c2e82c79d6df3f5215": "Venta", "b774aaaabeace60cd5b9ec5f9cca0408": "Renta" };
const PROPERTY_TYPE_NAMES = { "6a0f66dbbd3a9264550819c3": "Nave industrial" };
const CITY_NAMES = { "6a6afa734f4355cd4f85678e": "Nuevo León" };

// This item's fieldData, fetched directly from Webflow moments ago.
const item = {
  id: "6a6afb4bc394d715b5b8697f",
  createdOn: "2026-07-30T07:20:43.329Z",
  lastPublished: "2026-07-30T20:31:11.016Z",
  fieldData: {
    "nombre-publico": "Bodega en Renta Apodaca, Monterrey en Parque Industrial",
    slug: "bodega-en-renta-apodaca-monterrey-en-parque-industrial-wo6030",
    "featured-image": { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6afb49c394d715b5b8690d_EB-WO6030.png" },
    gallery: [
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6afb49c394d715b5b8690d_EB-WO6030.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6bb2c87e1967dbe3e8aacb_EB-QM3255.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6afb4bc394d715b5b8694a_EB-WO6030.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6b03aa6a227af3b1d78df8_EB-WO6030.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6bb2c97e1967dbe3e8aad4_EB-QM3255.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6bb2c87e1967dbe3e8aacf_EB-QM3255.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6bb2c97e1967dbe3e8aad7_EB-QM3255.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6afb4ac394d715b5b86929_EB-WO6030.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6b03be6a227af3b1d78ec3_EB-WO6030.png" },
      { url: "https://cdn.prod.website-files.com/6a0f66dbbd3a9264550804b3/6a6b06d860f9829294730a02_EB-WO6030.png" },
    ],
    "precio-de-propiedad": "$523,309.80 MXN",
    "location-full": "Ex Hacienda Santa Rosa, Apodaca, Nuevo León",
    "metros-cuadrados": "4025.46",
    currency: "fdd254535cf1c1c46439688f3fc38b56",
    "operation-type": "b774aaaabeace60cd5b9ec5f9cca0408",
    "property-type": "6a0f66dbbd3a9264550819c3",
    city: "6a6afa734f4355cd4f85678e",
    bedrooms: 0,
    bathrooms: 0,
    parking: 16,
    andenes: null,
    destacada: false,
  },
};

const fd = item.fieldData;
const metros = parseFloat(fd["metros-cuadrados"]);
const precio = parseFloat(String(fd["precio-de-propiedad"]).replace(/[^0-9.]/g, ""));

const record = {
  objectID: item.id,
  name: fd["nombre-publico"],
  slug: fd.slug,
  featuredImageUrl: fd["featured-image"]?.url ?? null,
  galleryImages: (fd.gallery ?? []).map((g) => g.url),
  precioDisplay: fd["precio-de-propiedad"],
  precioNumerico: precio,
  locationFull: fd["location-full"],
  metrosDisplay: metros.toLocaleString("es-MX"),
  metrosNumerico: metros,
  currency: CURRENCY_NAMES[fd.currency] ?? fd.currency,
  operationType: OPERATION_NAMES[fd["operation-type"]] ?? fd["operation-type"],
  propertyType: PROPERTY_TYPE_NAMES[fd["property-type"]] ?? fd["property-type"],
  city: CITY_NAMES[fd.city] ?? fd.city,
  bedrooms: fd.bedrooms ?? 0,
  bathrooms: fd.bathrooms ?? 0,
  parking: fd.parking ?? 0,
  andenes: fd.andenes ?? 0,
  destacada: fd.destacada ?? false,
  pageUrl: `/propiedades/${fd.slug}`,
  createdOn: new Date(item.createdOn).getTime(),
  lastPublished: new Date(item.lastPublished).getTime(),
  cmsOrder: 0,
};

console.log("Record to add:\n", JSON.stringify(record, null, 2));

const res = await fetch(`https://${APP_ID}.algolia.net/1/indexes/${INDEX}/${record.objectID}`, {
  method: "PUT",
  headers: {
    "X-Algolia-Application-Id": APP_ID,
    "X-Algolia-API-Key": ADMIN_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(record),
});

const body = await res.json();
console.log("\nAlgolia response:", res.status, JSON.stringify(body, null, 2));
