export interface NavItem {
  label: string;
  to: string;
  glyph: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    group: "Observe",
    items: [
      { label: "Overview", to: "/", glyph: "OV" },
      { label: "Traces", to: "/traces", glyph: "TR" },
      { label: "Live", to: "/live", glyph: "LV" },
    ],
  },
  {
    group: "Analyze",
    items: [
      { label: "Analytics", to: "/analytics", glyph: "AN" },
      { label: "Models", to: "/models", glyph: "MD" },
      { label: "Tools", to: "/tools", glyph: "TL" },
    ],
  },
  {
    group: "Setup",
    items: [
      { label: "Connect", to: "/connect", glyph: "CN" },
      { label: "Settings", to: "/settings", glyph: "ST" },
    ],
  },
];

/** Resolve a page title from a pathname for the topbar. */
export function titleFor(path: string): string {
  for (const g of NAV) {
    for (const it of g.items) {
      if (it.to === path) return it.label;
    }
  }
  if (path.startsWith("/traces/")) return "Trace detail";
  if (path.startsWith("/diff")) return "Compare runs";
  return "AgentGlass";
}
