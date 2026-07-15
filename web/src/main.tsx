import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import { LiveProvider } from "./lib/live";
import { AssistantProvider } from "./lib/assistant";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <AssistantProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AssistantProvider>
      </LiveProvider>
    </QueryClientProvider>
  </StrictMode>,
);
