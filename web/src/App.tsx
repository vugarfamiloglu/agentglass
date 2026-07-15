import { Route, Routes } from "react-router-dom";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Overview } from "./pages/Overview";
import { Placeholder } from "./pages/Placeholder";

export function App() {
  return (
    <div className="shell">
      <Sidebar />
      <Topbar />
      <main className="workbench">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/traces" element={<Placeholder title="Traces" note="The trace explorer lands next." />} />
          <Route path="/live" element={<Placeholder title="Live" note="The real-time run feed lands next." />} />
          <Route path="/analytics" element={<Placeholder title="Analytics" note="Spend, latency, and token analytics land next." />} />
          <Route path="/models" element={<Placeholder title="Models" note="Per-model breakdowns land next." />} />
          <Route path="/tools" element={<Placeholder title="Tools" note="Per-tool breakdowns land next." />} />
          <Route path="/connect" element={<Placeholder title="Connect" note="Copy-paste setup for the recording proxy lands next." />} />
          <Route path="/settings" element={<Placeholder title="Settings" note="Retention, pricing, and the assistant key land next." />} />
          <Route path="*" element={<Placeholder title="Not found" note="No page at this address." />} />
        </Routes>
      </main>
    </div>
  );
}
