import React, { createContext, useContext, useState, useCallback } from 'react';

interface ThemeState {
  inverted: boolean;
  toggleInvert: () => void;
}

const ThemeContext = createContext<ThemeState>({
  inverted: false,
  toggleInvert: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [inverted, setInverted] = useState(false);
  const toggleInvert = useCallback(() => setInverted((v) => !v), []);

  return (
    <ThemeContext.Provider value={{ inverted, toggleInvert }}>
      {children}
    </ThemeContext.Provider>
  );
}
