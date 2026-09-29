import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { traceStore } from '../../lib/traceStore.js';

const VivaContext = createContext(null);
const KEY = 'hrms.vivaMode';

/** "Viva Mode": shows traceability chips on every screen and the Live UML panel. */
export function VivaProvider({ children }) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [panelOpen, setPanelOpen] = useState(false);
  const [traces, setTraces] = useState(traceStore.get());
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => traceStore.subscribe(setTraces), []);
  useEffect(() => { try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* ignore */ } }, [enabled]);

  const openTrace = useCallback((id) => { setSelectedId(id ?? traceStore.get()[0]?.id ?? null); setPanelOpen(true); }, []);

  return (
    <VivaContext.Provider value={{ enabled, setEnabled, toggle: () => setEnabled((v) => !v), panelOpen, setPanelOpen, traces, selectedId, setSelectedId, openTrace }}>
      {children}
    </VivaContext.Provider>
  );
}

export const useViva = () => useContext(VivaContext);
