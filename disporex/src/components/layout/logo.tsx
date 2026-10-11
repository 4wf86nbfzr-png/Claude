export function Logo({ light = false, size = 22 }: { light?: boolean; size?: number }) {
  const color = light ? "#ffffff" : "#0f1f3d";
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="4" fill={light ? "rgba(255,255,255,0.12)" : "#0f1f3d"} />
        <path d="M7 7h5.2c2.9 0 4.8 2 4.8 5s-1.9 5-4.8 5H7V7zm2.4 2.1v5.8h2.6c1.6 0 2.5-1.1 2.5-2.9s-.9-2.9-2.5-2.9H9.4z" fill={light ? "#fff" : "#fff"} />
        <circle cx="17.5" cy="17.5" r="1.6" fill="#0f766e" />
      </svg>
      <span className="font-semibold tracking-tight text-[15px]" style={{ color }}>
        DispoRex
      </span>
    </span>
  );
}
