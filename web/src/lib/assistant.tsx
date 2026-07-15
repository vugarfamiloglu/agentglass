import { createContext, useContext, useState, type ReactNode } from "react";

interface AssistantState {
  open: boolean;
  toggle: () => void;
}

const Ctx = createContext<AssistantState>({ open: false, toggle: () => {} });

export function useAssistant(): AssistantState {
  return useContext(Ctx);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("ag-assistant") !== "closed";
    } catch {
      return true;
    }
  });

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem("ag-assistant", next ? "open" : "closed");
      } catch {
        /* storage unavailable — keep in-memory only */
      }
      return next;
    });

  return <Ctx.Provider value={{ open, toggle }}>{children}</Ctx.Provider>;
}
