"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@/components/ficha/Ficha.css";
import { FichaDocument } from "@/components/ficha/FichaDocument";
import { PropertyForm } from "@/components/editor/PropertyForm";
import { LcbLogo } from "@/components/LcbLogo";
import type { FichaData } from "@/types/ficha";

const FICHA_WIDTH = 1049;

export default function FichaEditorPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = use(params);
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<"editar" | "preview">("editar");
  const [scale, setScale] = useState(0.6);
  const previewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch(`/api/property/${publicId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar la propiedad");
        return res.json();
      })
      .then(setFicha)
      .catch((err) => setError(err.message));
  }, [publicId]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;

    function recompute(width: number) {
      const available = width - 32; // padding lateral
      setScale(Math.min(0.6, Math.max(0.28, available / FICHA_WIDTH)));
    }

    // El ResizeObserver no dispara de forma confiable cuando el elemento
    // pasa de display:none a visible (pestaña "Vista previa" en móvil), así
    // que además se recalcula a mano cada vez que cambia la pestaña activa.
    recompute(el.clientWidth);

    const observer = new ResizeObserver(([entry]) => recompute(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Safari (sobre todo iOS) no maneja bien el patrón fetch + blob +
  // URL.createObjectURL + <a download> para archivos grandes: el PDF a veces
  // se abre en el visor interno en vez de descargarse, y si el asesor
  // intenta compartirlo desde ahí, comparte el texto "blob:https://..." en
  // vez del archivo real. Un <form> con method="POST" hacia /api/pdf y
  // target="_blank" hace que sea el navegador el que reciba la respuesta
  // directamente (con el Content-Disposition real), como una descarga
  // normal de toda la vida -- funciona igual en Safari, Chrome y Firefox.
  function handleDownload() {
    if (!ficha) return;
    setDownloading(true);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/pdf";
    form.target = "_blank";
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "ficha";
    input.value = JSON.stringify(ficha);
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
    form.remove();

    setTimeout(() => setDownloading(false), 1500);
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div style={{ padding: 32, color: "var(--lcb-gray-text)", fontSize: 14 }}>
        Cargando propiedad {publicId}...
      </div>
    );
  }

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="editor-header-left">
          <LcbLogo size={30} />
          <Link href="/" className="app-btn app-btn-secondary">
            Crear nueva
          </Link>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="app-btn app-btn-primary"
        >
          {downloading ? "Generando PDF..." : "Descargar PDF"}
        </button>
      </header>

      <div className="editor-tabs">
        <button
          className={`editor-tab-btn ${activeTab === "editar" ? "is-active" : ""}`}
          onClick={() => setActiveTab("editar")}
        >
          Editar
        </button>
        <button
          className={`editor-tab-btn ${activeTab === "preview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("preview")}
        >
          Vista previa
        </button>
      </div>

      <div className="editor-body" data-active-tab={activeTab}>
        <aside className="editor-sidebar">
          <PropertyForm ficha={ficha} onChange={setFicha} />
        </aside>

        <main className="editor-main" ref={previewRef}>
          <div style={{ zoom: scale }}>
            <FichaDocument ficha={ficha} />
          </div>
        </main>
      </div>
    </div>
  );
}
