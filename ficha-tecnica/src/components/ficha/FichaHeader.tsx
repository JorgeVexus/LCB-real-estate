import type { FichaAgent } from "@/types/ficha";

export function FichaHeader({
  title,
  agent,
  logoSrc = "/logo-lcb.png",
}: {
  title: string;
  agent: FichaAgent;
  logoSrc?: string;
}) {
  return (
    <div className="ficha-header">
      <div className="ficha-logo-row">
        <img className="ficha-logo-mark" src={logoSrc} alt="LCB Industrial Real Estate" />
        <div className="ficha-agent-info">
          <div className="ficha-agent-name">{agent.name}</div>
          {agent.phone && <div className="ficha-agent-contact">Celular: {agent.phone}</div>}
          {agent.email && <div className="ficha-agent-contact">{agent.email}</div>}
        </div>
      </div>
      <div className="ficha-header-title">{title}</div>
    </div>
  );
}
