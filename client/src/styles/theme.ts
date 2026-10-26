export type ThemePreference = "light" | "dark";

/** The theme lives on the account; signed-out pages are always light. */
export function applyTheme(theme: ThemePreference): void {
  document.documentElement.dataset.theme = theme;
}
