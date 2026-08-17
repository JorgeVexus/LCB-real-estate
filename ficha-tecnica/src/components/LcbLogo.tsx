/** Logo real de LCB Industrial Real Estate (public/logo-lcb.png). */
export function LcbLogo({ size = 56 }: { size?: number }) {
  return (
    <img
      src="/logo-lcb.png"
      alt="LCB Industrial Real Estate"
      style={{ height: size, width: "auto", display: "block" }}
    />
  );
}
