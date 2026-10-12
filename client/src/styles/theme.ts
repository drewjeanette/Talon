export type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "talon-theme";

export function getStoredTheme(): ThemePreference {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function initializeTheme(): ThemePreference {
  const theme = getStoredTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}
