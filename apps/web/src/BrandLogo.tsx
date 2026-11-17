/** Renders the Cherry Berry logo mark alongside the brand wordmark. */
export function BrandLogo({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ display: "block", width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      />
      <span>Cherry Berry</span>
    </span>
  );
}
