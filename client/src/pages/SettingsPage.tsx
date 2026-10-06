import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { NotificationSettings } from "../components/settings/NotificationSettings";
import { AccountSettings } from "../components/settings/AccountSettings";

// Each entry is one Settings tab. To add a section, add an entry here; the
// tab list, keyboard navigation and ?tab= deep links pick it up automatically.
const SECTIONS = [
  { id: "notifications", label: "Notifications", Component: NotificationSettings },
  { id: "account", label: "Account", Component: AccountSettings },
] as const;

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, SECTIONS.findIndex((s) => s.id === searchParams.get("tab")));
  const active = SECTIONS[activeIndex];

  function select(index: number, focus = false) {
    setSearchParams({ tab: SECTIONS[index].id }, { replace: true });
    if (focus) tabRefs.current[index]?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    const last = SECTIONS.length - 1;
    const next =
      e.key === "ArrowDown" || e.key === "ArrowRight" ? (activeIndex === last ? 0 : activeIndex + 1)
      : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (activeIndex === 0 ? last : activeIndex - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  }

  return (
    <main id="main-content" className="settings-page">
      <h1 className="settings-page__title">Settings</h1>
      <div className="settings-layout">
        <div role="tablist" aria-label="Settings sections" aria-orientation="vertical" className="settings-tabs" onKeyDown={handleKeyDown}>
          {SECTIONS.map((section, index) => (
            <button
              key={section.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              type="button"
              role="tab"
              id={`settings-tab-${section.id}`}
              aria-controls={`settings-panel-${section.id}`}
              aria-selected={index === activeIndex}
              tabIndex={index === activeIndex ? 0 : -1}
              className="settings-tabs__tab"
              onClick={() => select(index)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <section
          role="tabpanel"
          id={`settings-panel-${active.id}`}
          aria-labelledby={`settings-tab-${active.id}`}
          className="settings-panel"
        >
          <active.Component />
        </section>
      </div>
    </main>
  );
}
