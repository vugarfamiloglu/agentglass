import { Route, Routes } from "react-router-dom";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { AssistantRail } from "./components/AssistantRail";
import { useAssistant } from "./lib/assistant";
import { Overview } from "./pages/Overview";
import { Traces } from "./pages/Traces";
import { TraceDetail } from "./pages/TraceDetail";
import { Connect } from "./pages/Connect";
import { Diff } from "./pages/Diff";
import { Analytics } from "./pages/Analytics";
import { Models } from "./pages/Models";
import { Tools } from "./pages/Tools";
import { Live } from "./pages/Live";
import { Settings } from "./pages/Settings";
import { Placeholder } from "./pages/Placeholder";

export function App() {
  const { open } = useAssistant();
  return (
    <div className={`shell${open ? " has-rail" : ""}`}>
      <Sidebar />
      <Topbar />
      <main className="workbench">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/traces" element={<Traces />} />
          <Route path="/traces/:id" element={<TraceDetail />} />
          <Route path="/diff" element={<Diff />} />
          <Route path="/diff/:a" element={<Diff />} />
          <Route path="/diff/:a/:b" element={<Diff />} />
          <Route path="/live" element={<Live />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/models" element={<Models />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Placeholder title="Not found" note="No page at this address." />} />
        </Routes>
      </main>
      <AssistantRail />
    </div>
  );
}
