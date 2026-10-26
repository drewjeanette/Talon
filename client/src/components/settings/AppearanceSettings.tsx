import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { applyTheme, type ThemePreference } from "../../styles/theme";

export function AppearanceSettings() {
  const { user, refreshUser } = useAuth();
  const [theme, setTheme] = useState<ThemePreference>(user?.theme ?? "light");
  const [error, setError] = useState<string | null>(null);
  const toggleLabel = theme === "dark" ? "Light mode" : "Dark mode";

  async function changeTheme(nextTheme: ThemePreference) {
    const previous = theme;
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setError(null);
    try {
      await api.patch("/settings/appearance", { theme: nextTheme });
      await refreshUser();
    } catch {
      setTheme(previous);
      applyTheme(previous);
      setError("Couldn't save your appearance setting. Try again.");
    }
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
            onChange={(event) => void changeTheme(event.target.checked ? "dark" : "light")}
          />
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
