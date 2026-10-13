import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { displayName, searchPeople, type Searchable } from "../lib/nameSearch";

export interface SearchablePerson extends Searchable {
  id: number;
  /** Extra context shown under the name in suggestions, e.g. department. */
  detail?: string | null;
}

interface PersonSearchProps<T extends SearchablePerson> {
  label: string;
  people: T[];
  /** Selected person ids. Single mode uses at most one. */
  value: number[];
  onChange: (ids: number[]) => void;
  multiple?: boolean;
  hint?: string;
  placeholder?: string;
}

/**
 * The one person search used across Talon (WAI-ARIA combobox). Suggestions
 * appear under the field as you type and match first, last, or preferred
 * names, nicknames, and small typos. Arrow keys move, Enter or a click picks,
 * Escape closes. A choice only takes effect when it is picked.
 */
export function PersonSearch<T extends SearchablePerson>({ label, people, value, onChange, multiple = false, hint, placeholder }: PersonSearchProps<T>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = useMemo(() => value.map((selectedId) => people.find((person) => person.id === selectedId)).filter((person): person is T => Boolean(person)), [people, value]);
  const suggestions = useMemo(() => {
    const available = multiple ? people.filter((person) => !value.includes(person.id)) : people;
    return query.trim() ? searchPeople(available, query) : available.slice(0, 8);
  }, [people, query, value, multiple]);
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const expanded = open && suggestions.length > 0;

  function choose(person: T) {
    if (multiple) {
      onChange([...value, person.id]);
      setQuery("");
    } else {
      onChange([person.id]);
      setQuery("");
    }
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(personId: number) {
    onChange(value.filter((selectedId) => selectedId !== personId));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (expanded ? Math.min(index + 1, suggestions.length - 1) : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (expanded && suggestions[active]) {
        event.preventDefault();
        choose(suggestions[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery("");
      }
    } else if (event.key === "Backspace" && !query && multiple && value.length) {
      remove(value[value.length - 1]);
    }
  }

  const single = !multiple ? selected[0] : undefined;

  return (
    <div className="person-search">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={hintId} className="person-search__hint">{hint}</p>}
      {(multiple ? selected.length > 0 : Boolean(single)) && (
        <ul className="person-search__chips" aria-label={`Selected for ${label}`}>
          {selected.map((person) => (
            <li key={person.id} className="person-search__chip">
              <span>{displayName(person)}</span>
              <button type="button" onClick={() => remove(person.id)} aria-label={`Remove ${displayName(person)}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="person-search__field">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          placeholder={placeholder ?? "Type a first, last, or preferred name"}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="person-search__list" hidden={!expanded}>
          {suggestions.map((person, index) => (
            <li
              key={person.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className="person-search__option"
              // Keep focus in the input so the click lands before blur closes the list.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(person)}
            >
              <span className="person-search__name">{displayName(person)}</span>
              {person.detail && <span className="person-search__detail">{person.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {open && query.trim() ? (suggestions.length ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}. Use the arrow keys to choose.` : "No matching people.") : ""}
      </p>
      {open && query.trim() && suggestions.length === 0 && <p className="person-search__empty">No one matches "{query.trim()}".</p>}
    </div>
  );
}
