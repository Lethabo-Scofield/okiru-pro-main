import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface ClientContextType {
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
}

const ClientContext = createContext<ClientContextType>({
  activeClientId: null,
  setActiveClientId: () => {},
});

export function ClientProvider({ children, initialClientId }: { children: ReactNode; initialClientId?: string }) {
  const [activeClientId, setActiveClientId] = useState<string | null>(() => {
    if (initialClientId) {
      localStorage.setItem('okiru-pro-active-client', initialClientId);
      return initialClientId;
    }
    return localStorage.getItem('okiru-pro-active-client') || null;
  });

  useEffect(() => {
    if (activeClientId) {
      localStorage.setItem('okiru-pro-active-client', activeClientId);
    } else {
      localStorage.removeItem('okiru-pro-active-client');
    }
  }, [activeClientId]);

  return (
    <ClientContext.Provider value={{ activeClientId, setActiveClientId }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useActiveClient() {
  return useContext(ClientContext);
}
