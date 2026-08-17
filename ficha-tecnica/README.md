# LCB — Generador de fichas técnicas (EasyBroker → PDF)

Dashboard interno para que los asesores de LCB generen, en minutos, una ficha técnica en PDF de cualquier propiedad publicada en EasyBroker, con el diseño aprobado en Figma, editando cualquier dato (precio, metraje, descripción, fotos) antes de exportar.

## Cómo funciona

1. El asesor pega la URL o el ID de EasyBroker (`EB-XXXXXX`) en `/`.
2. `/ficha/[publicId]` trae los datos de la propiedad (`GET /api/property/[publicId]`), los pre-llena en un formulario editable y muestra un preview idéntico a lo que se va a exportar.
3. El asesor edita lo que necesite (precio, m², secciones de la descripción, selección/orden de fotos, agente, CTA) y descarga el PDF (`POST /api/pdf`), que imprime exactamente el mismo componente que ve en pantalla usando Chromium headless (Playwright).

No hay base de datos: nada se persiste en el servidor, todo el estado editado vive en el navegador durante la sesión y se envía completo al generar el PDF.

## Correr local

```bash
npm install
npx playwright install chromium   # solo la primera vez, para generar PDFs en local
npm run dev
```

Copia `.env.local.example` a `.env.local` (o revisa las variables abajo) antes de arrancar.

## Variables de entorno

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `EASYBROKER_API_KEY` | Sí | Misma cuenta EasyBroker que usa `lcb-easybroker-sync` (solo lectura). |
| `DASHBOARD_PASSWORD` | Sí | Contraseña compartida para entrar al dashboard (protección simple del MVP). |

No hace falta ninguna cuenta ni API key de mapas: el mapa usa el embed gratuito de Google Maps (`google.com/maps?q=lat,lng&output=embed`), el mismo truco sin key que ya usa `lcb-realestate.com` en sus fichas de propiedad — cero tarjeta, cero registro.

## Deploy

Pensado para Vercel, bajo la cuenta/proyecto de Fernando:

1. Conectar el repo a un proyecto de Vercel nuevo.
2. Configurar las 2 variables de entorno de arriba en el proyecto.
3. `/api/pdf` corre como función serverless Node.js (Pages Router) que arranca Chromium con `@sparticuz/chromium` — verificar que el plan de Vercel tenga suficiente memoria/duración (`maxDuration` ya está en 60s en `next.config`/route). Si el plan Hobby no alcanza, subir a Pro.

## Diseño del dashboard (no de la ficha)

La interfaz del dashboard (login, home, editor) usa los tokens reales del sitio (`lcb-realestate.com`): tipografía Work Sans, naranja de marca `#f39300`, negro, fondo gris `#f4f2f1`, radios 20/10/5px — ver `src/app/globals.css`. El logo (`src/components/LcbLogo.tsx`) es un **SVG recreado a mano** a partir de la imagen que compartió el equipo, porque no hay forma de guardar el archivo adjunto original desde el chat a disco. Si tienen el PNG/SVG oficial, colóquenlo en `public/logo.svg` y reemplacen `LcbMark`/`LcbWordmark` por un `<img>`/`<Image>` apuntando ahí — el diseño de la ficha (PDF) no cambia, solo el logo.

El diseño de la **ficha en sí** (PDF, páginas 1 y 2) sigue el Figma aprobado tal cual — no se tocó su paleta ni layout al aplicar el estilo del dashboard, salvo corregir el color del footer de un negro-navy aproximado a negro puro `#000`, ya que no había forma de leer el color exacto del Figma (venía como imagen rasterizada) y ahora sí conocemos el negro real de marca.

## Notas de arquitectura

- **Un solo componente para preview y PDF**: `src/components/ficha/FichaDocument.tsx` se usa tanto en pantalla (`/ficha/[publicId]`) como en el render a PDF (`src/lib/pdf-render.ts`), así que "lo que ves es lo que se exporta".
- **CSS global, no CSS Modules**: `Ficha.css` es una hoja de estilos plana (no un `.module.css`) a propósito — `pdf-render.ts` lee ese archivo de disco y lo inyecta como `<style>` antes de imprimir con Playwright, algo que no funciona igual con CSS Modules fuera del pipeline normal de Next.
- **`/api/pdf` vive en el Pages Router** (`src/pages/api/pdf.ts`), no en `app/api/`: `renderFichaPdf` usa `react-dom/server`, y React bloquea ese import dentro del grafo de módulos "react-server" que usan los Route Handlers de `app/`. Las API Routes del Pages Router corren como Node.js plano, sin esa restricción.
- **Auth**: `src/proxy.ts` (la Proxy/Middleware de Next 16) protege todo el sitio con una cookie de sesión firmada (HMAC sobre `DASHBOARD_PASSWORD`), salvo `/login` y `/api/login`.
- **Mapa**: `<iframe>` embebido de Google Maps sin API key (`src/lib/map.ts`), igual que el sitio público. Como un `<iframe>` no se convierte en link real al imprimir a PDF, hay un `<a href>` transparente superpuesto (`.ficha-map-image-link`) que sí sobrevive la impresión y es lo que hace clicable el mapa dentro del PDF.

## Pendiente para Jorge

El criterio de aceptación pide que Jorge defina por escrito qué significa **"PDF editable"**. Esta implementación asume la interpretación "editable dentro del dashboard antes de exportar" (todo campo y la selección/orden de fotos son editables en el formulario antes de descargar), y el PDF final es un documento estático — no un PDF rellenable ni un archivo fuente editable. Falta confirmación explícita por escrito.
