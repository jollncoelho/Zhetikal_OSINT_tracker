import { createContext, useContext, useState } from 'react';

type View = 'graph' | 'map';

interface NavigationContextValue {
  view: View;
  setView: (v: View) => void;
  hoveredIdentifierId: string | null;
  setHoveredIdentifierId: (id: string | null) => void;
  focusNodeId: string | null;
  setFocusNodeId: (id: string | null) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>('graph');
  const [hoveredIdentifierId, setHoveredIdentifierId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  return (
    <NavigationContext.Provider
      value={{
        view, setView,
        hoveredIdentifierId, setHoveredIdentifierId,
        focusNodeId, setFocusNodeId,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');
  return ctx;
}
