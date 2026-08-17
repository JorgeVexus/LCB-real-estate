"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LcbLogo } from "@/components/LcbLogo";
import { extractPublicId } from "@/lib/extract-public-id";

export default function HomePage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const publicId = extractPublicId(value);
    if (!publicId) {
      setError('No se reconoce un ID de EasyBroker (ej. "EB-AB1234") en lo que pegaste.');
      return;
    }
    router.push(`/ficha/${publicId}`);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="app-card" style={{ width: "100%", maxWidth: 460, padding: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <LcbLogo size={40} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
          Generador de fichas técnicas
        </h1>
        <p style={{ fontSize: 14, color: "var(--lcb-gray-text)", marginBottom: 24 }}>
          Pega la URL o el ID de EasyBroker de la propiedad (ej. EB-AB1234).
        </p>
        <form onSubmit={handleSubmit}>
          <label className="app-label" htmlFor="property">
            Propiedad
          </label>
          <input
            id="property"
            type="text"
            autoFocus
            className="app-input"
            placeholder="https://easybroker.com/... o EB-AB1234"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="submit"
            className="app-btn app-btn-primary"
            style={{ width: "100%", marginTop: 16, padding: "12px 20px" }}
          >
            Generar ficha
          </button>
          {error && (
            <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
