import { useEffect, useState } from 'react';

export type UiTheme = 'a' | 'b' | 'c' | 'd';

export const UI_THEMES: Array<{ id: UiTheme; label: string; note: string }> = [
  { id: 'a', label: 'Handoff',  note: 'The delivered design, unchanged' },
  { id: 'b', label: 'Refined',  note: 'Same language, more carefully executed' },
  { id: 'c', label: 'Airy',     note: 'Light sidebar, calmer, more whitespace' },
  { id: 'd', label: 'Focused',  note: 'Full dark, for evening work and demos' },
];

const KEY = 'mendtrix.ui';

/**
 * DEMO SCAFFOLDING — a decision aid for choosing a visual direction.
 * Removed with the rest of the demo affordances; the chosen direction
 * then becomes the default token set and this component goes away.
 *
 * Each option is a block of custom-property overrides in themes.css and
 * touches no component code.
 */
export function ThemeSwitcher({ value, onChange }: { value: UiTheme; onChange: (t: UiTheme) => void }) {
  return (
    <div className="ui-switch" role="group" aria-label="UI direction">
      {UI_THEMES.map((t) => (
        <button key={t.id} aria-pressed={value === t.id} title={t.note} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function useUiTheme(): [UiTheme, (t: UiTheme) => void] {
  const [theme, setTheme] = useState<UiTheme>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'a' || saved === 'b' || saved === 'c' || saved === 'd') return saved;
    } catch { /* private mode, blocked storage — fall through */ }
    return 'a';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ui', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* non-fatal */ }
  }, [theme]);

  return [theme, setTheme];
}
