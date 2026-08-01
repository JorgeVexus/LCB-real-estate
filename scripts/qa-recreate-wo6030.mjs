import { wf, COLLECTION_ID, callWithRetry } from "./algolia-sync-lib.mjs";

const res = await fetch("https://api.easybroker.com/v1/properties/EB-WO6030", {
  headers: { accept: "application/json", "X-Authorization": process.env.EASYBROKER_API_KEY },
});
const p = await res.json();

const description = (p.description ?? "").replace(/\s*\n+\s*/g, " ").trim();
const op = p.operations[0];

const fieldData = {
  name: `${p.public_id} - ${p.title}`,
  slug: "bodega-en-renta-apodaca-monterrey-en-parque-industrial-wo6030-r", // temp suffix until Webflow frees the original slug
  "nombre-publico": p.title,
  "property-id": p.public_id,
  descripcion: `<p>${description}</p>`,
  "location-full": p.location.name,
  "property-type": "6a0f66dbbd3a9264550819c3", // Nave industrial
  city: "6a6afa734f4355cd4f85678e", // Nuevo León
  agente: "6a0f66dbbd3a9264550819c7", // León Bado
  "metros-cuadrados": String(p.construction_size),
  "lot-size": Math.trunc(p.lot_size ?? 0),
  bedrooms: Math.trunc(p.bedrooms ?? 0),
  bathrooms: Math.trunc(p.bathrooms ?? 0),
  parking: Math.trunc(p.parking_spaces ?? 0),
  "featured-image": { url: p.property_images[0].url },
  gallery: p.property_images.map((img) => ({ url: img.url })),
  latitud: Math.trunc(p.location.latitude),
  longitud: Math.trunc(p.location.longitude),
  "location-full-link": `https://maps.google.com/?q=${p.location.latitude},${p.location.longitude}`,
  "code-link-map": `<figure class="w-richtext-figure-type-video w-richtext-align-center" style="padding-bottom:" data-rt-type="video" data-rt-align="center" data-rt-max-width="" data-rt-max-height="" data-rt-dimensions="" data-page-url=""><div><iframe src="https://www.google.com/maps?q=${p.location.latitude},${p.location.longitude}&z=15&output=embed" allowfullscreen=""></iframe></div></figure>`,
  "operation-type": "b774aaaabeace60cd5b9ec5f9cca0408", // Renta
  currency: "fdd254535cf1c1c46439688f3fc38b56", // MXN
  "precio-de-propiedad": op.formatted_amount,
};

const created = await callWithRetry(() =>
  wf.collections.items.createItem(COLLECTION_ID, { isArchived: false, isDraft: false, fieldData })
);
console.log("Created:", created.id, created.fieldData.slug);

await callWithRetry(() => wf.collections.items.publishItem(COLLECTION_ID, { itemIds: [created.id] }));
console.log("Published.");
