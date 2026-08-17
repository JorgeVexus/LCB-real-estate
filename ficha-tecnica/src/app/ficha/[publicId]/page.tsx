"use client";

import { use, useEffect, useState } from "react";
import "@/components/ficha/Ficha.css";
import { FichaDocument } from "@/components/ficha/FichaDocument";
import { PropertyForm } from "@/components/editor/PropertyForm";
import { PhotoPicker } from "@/components/editor/PhotoPicker";
import { LcbLogo } from "@/components/LcbLogo";
import type { FichaData } from "@/types/ficha";

export default function FichaEditorPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = use(params);
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/property/${publicId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar la propiedad");
        return res.json();
      })
      .then(setFicha)
      .catch((err) => setError(err.message));
  }, [publicId]);

  async function handleDownload() {
    if (!ficha) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ficha),
      });
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ficha.publicId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al descargar el PDF");
    } finally {
      setDownloading(false);
    }
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--lcb-gray-border)",
          zIndex: 10,
        }}
      >
        <LcbLogo size={30} />
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="app-btn app-btn-primary"
        >
          {downloading ? "Generando PDF..." : "Descargar PDF"}
        </button>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 380,
            overflowY: "auto",
            padding: 20,
            borderRight: "1px solid var(--lcb-gray-border)",
            background: "var(--lcb-white)",
          }}
        >
          <PhotoPicker ficha={ficha} onChange={setFicha} />
          <PropertyForm ficha={ficha} onChange={setFicha} />
        </aside>

        <main style={{ flex: 1, overflow: "auto", background: "#3a3a3a", padding: 32 }}>
          <div style={{ transform: "scale(0.6)", transformOrigin: "top center" }}>
            <FichaDocument ficha={ficha} />
          </div>
        </main>
      </div>
    </div>
  );
}
