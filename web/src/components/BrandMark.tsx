/** The Glasswing mark: two translucent wings refracting a cyan→violet spectrum. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gw-wing" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38e1c8" />
          <stop offset="1" stopColor="#8b7bff" />
        </linearGradient>
      </defs>
      <path d="M16 3 L28 16 L16 29 Z" fill="url(#gw-wing)" opacity="0.9" />
      <path d="M16 3 L4 16 L16 29 Z" fill="url(#gw-wing)" opacity="0.42" />
      <path d="M16 3 L16 29" stroke="#0a0b0f" strokeWidth="1.4" strokeOpacity="0.55" />
      <circle cx="16" cy="16" r="2.1" fill="#0a0b0f" />
      <circle cx="16" cy="16" r="1.1" fill="url(#gw-wing)" />
    </svg>
  );
}
