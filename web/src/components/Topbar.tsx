import { useLocation } from "react-router-dom";

import { titleFor } from "../nav";
import { useLive } from "../lib/live";

export function Topbar() {
  const { pathname } = useLocation();
  const { connected, traces } = useLive();
  const running = traces.filter((t) => t.status === "running").length;
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
        {running > 0 && <span className="run-count mono">{running} running</span>}
        <div className={`live-pill${connected ? " is-live" : ""}`}>
          <span className="live-dot" />
          <span className="mono">{connected ? "live" : "offline"}</span>
        </div>
      </div>
    </header>
  );
}
