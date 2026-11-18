import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "cherry.theme";
const EVENT_NAME = "cherry-theme";

function readTheme(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(mode: ThemeMode) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }
}

export function initTheme(): ThemeMode {
  const mode = readTheme();
  applyTheme(mode);
  return mode;
}

export function setTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
  applyTheme(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      applyTheme(readTheme());
      cb();
    }
  };
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): [ThemeMode, () => void] {
  const mode = useSyncExternalStore(subscribe, readTheme, (): ThemeMode => "light");
  const toggle = () => setTheme(mode === "dark" ? "light" : "dark");
  return [mode, toggle];
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      className={dark ? "theme-ico theme-ico-dark" : "theme-ico"}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </>
      ) : (
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      )}
    </svg>
  );
}

/** Accessible light/dark mode switch button synchronized with document theme state. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [mode, toggle] = useTheme();
  const dark = mode === "dark";
  const cls = className ?? (compact ? "ed-ib theme-btn" : "btn theme-btn");

  return (
    <button
      type="button"
      className={cls}
      aria-label="Toggle dark mode"
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      <ThemeIcon dark={dark} />
      {!compact && <span>{dark ? "Light" : "Dark"}</span>}
    </button>
  );
}
