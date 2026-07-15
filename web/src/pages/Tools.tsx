import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { ToolTable } from "../components/ToolTable";

export function Tools() {
  const q = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(24) });
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Tools</h1>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Calls & failures by tool</div>
        </div>
        <ToolTable tools={q.data?.tools ?? []} />
      </section>
    </div>
  );
}
