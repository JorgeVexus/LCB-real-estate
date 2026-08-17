"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LcbLogo } from "@/components/LcbLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Contraseña incorrecta.");
      return;
    }

    router.push(searchParams?.get("next") || "/");
    router.refresh();
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
      <div className="app-card" style={{ width: "100%", maxWidth: 360, padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <LcbLogo size={40} />
        </div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          Generador de fichas técnicas
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--lcb-gray-text)",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          Acceso interno para asesores LCB
        </p>
        <form onSubmit={handleSubmit}>
          <label className="app-label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            className="app-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="app-btn app-btn-primary"
            style={{ width: "100%", marginTop: 16, padding: "12px 20px" }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {error && (
            <p style={{ color: "#c0392b", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
