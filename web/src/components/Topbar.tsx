import { useLocation } from "react-router-dom";

import { titleFor } from "../nav";

export function Topbar() {
  const { pathname } = useLocation();
  return (
    <header className="topbar">
      <div className="crumbs">
        <span className="crumb mono">AGENTGLASS</span>
        <span className="crumb-sep">›</span>
        <span className="crumb-title">{titleFor(pathname)}</span>
      </div>

      <div className="topbar-search">
        <span className="search-icon mono">⌕</span>
        <input className="search-input" placeholder="Search traces, models, tools…" />
        <kbd className="mono">/</kbd>
      </div>

      <div className="topbar-right">
        <div className="live-pill">
          <span className="live-dot" />
          <span className="mono">listening</span>
        </div>
      </div>
    </header>
  );
}
