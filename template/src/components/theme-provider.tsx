import { ScriptOnce } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

// Runs before first paint, so the page never renders light then flips to dark.
// Inlined as a string because it has to execute ahead of hydration.
function getThemeScript(storageKey: string, defaultTheme: Theme) {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(defaultTheme);

  return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => {},
});

// The stored theme is an external store: setTheme and other tabs both notify.
const themeListeners = new Set<() => void>();

function subscribeToTheme(onChange: () => void) {
  themeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(storageKey: string, defaultTheme: Theme): Theme {
  const stored = localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : defaultTheme;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  // Follows the device until the reader picks a mode.
  defaultTheme = "system",
  storageKey = "theme",
}: ThemeProviderProps) {
  // The server can't see localStorage, so it renders null: nothing is applied
  // until the client has read the stored theme, and ScriptOnce covers the gap.
  const stored = useSyncExternalStore(
    subscribeToTheme,
    () => readTheme(storageKey, defaultTheme),
    () => null,
  );
  const theme = stored ?? defaultTheme;

  useEffect(() => {
    if (stored === null) return;
    applyTheme(stored);
  }, [stored]);

  // Following the OS only means anything if it keeps following after load.
  useEffect(() => {
    if (stored !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [stored]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(storageKey, next);
    for (const listener of themeListeners) listener();
  };

  return (
    <ThemeProviderContext value={{ theme, setTheme }}>
      <ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeProviderContext>
  );
}

export function useTheme() {
  return useContext(ThemeProviderContext);
}
