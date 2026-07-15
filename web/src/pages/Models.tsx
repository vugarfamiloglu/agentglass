import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { ModelTable } from "../components/ModelTable";

export function Models() {
  const q = useQuery({ queryKey: ["analytics"], queryFn: () => api.analytics(24) });
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Models</h1>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Cost & usage by model</div>
        </div>
        <ModelTable models={q.data?.models ?? []} />
      </section>
    </div>
  );
}
