import { useState } from "react";
import { applyTheme, getStoredTheme, type ThemePreference } from "../../styles/theme";

export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const toggleLabel = theme === "dark" ? "Light mode" : "Dark mode";

  function changeTheme(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div className="card settings-card" aria-labelledby="appearance-heading" role="region">
      <h2 id="appearance-heading">Appearance</h2>
      <div className="settings-list settings-list--single">
        <div className="settings-list__item">
          <div>
            <label htmlFor="dark-mode-toggle" className="settings-list__label">{toggleLabel}</label>
          </div>
          <input
            id="dark-mode-toggle"
            className="settings-switch"
            type="checkbox"
            role="switch"
            checked={theme === "dark"}
            aria-checked={theme === "dark"}
            aria-label={toggleLabel}
            onChange={(event) => changeTheme(event.target.checked ? "dark" : "light")}
          />
        </div>
      </div>
    </div>
  );
}
