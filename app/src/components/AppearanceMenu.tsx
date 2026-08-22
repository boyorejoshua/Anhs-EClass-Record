import { useEffect, useRef, useState } from 'react';

export type Appearance = 'system' | 'refined' | 'comfortable' | 'dark';

const KEY = 'mendtrix.appearance';

export const APPEARANCES: Array<{ id: Appearance; label: string; note: string; glyph: string }> = [
  { id: 'system',      label: 'System',      note: 'Follow this device',            glyph: '◐' },
  { id: 'refined',     label: 'Refined',     note: 'Light, dense — the default',    glyph: '☀' },
  { id: 'comfortable', label: 'Comfortable', note: 'Light sidebar, roomier rows',   glyph: '◇' },
  { id: 'dark',        label: 'Dark',        note: 'Easier in low light',           glyph: '☾' },
];

/**
 * Appearance is a real user preference, not demo scaffolding: it
 * persists per person and survives a production build.
 *
 * It stays deliberately small. A records system does not need a theme
 * gallery — it needs a legible default, a dark option for people working
 * in the evening, and a roomier option for people who find dense grids
 * tiring.
 */
export function useAppearance(): [Appearance, (a: Appearance) => void] {
  const [pref, setPref] = useState<Appearance>(() => {
    try {
      const saved = localStorage.getItem(KEY) as Appearance | null;
      if (saved && APPEARANCES.some((a) => a.id === saved)) return saved;
    } catch { /* private mode or blocked storage — fall through to default */ }
    return 'refined';
  });

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const resolved =
        pref === 'system'
          ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'refined')
          : pref;

      // Refined is the :root default, so it is the ABSENCE of the
      // attribute rather than a value.
      if (resolved === 'refined') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', resolved);
    };

    // Transition colours only while the theme is actually changing.
    // Leaving the transition on permanently would make every hover and
    // focus feel sluggish.
    root.classList.add('theme-animating');
    apply();
    const t = window.setTimeout(() => root.classList.remove('theme-animating'), 400);

    try { localStorage.setItem(KEY, pref); } catch { /* non-fatal */ }

    // Only 'system' needs to keep listening for OS changes.
    let mq: MediaQueryList | undefined;
    if (pref === 'system' && window.matchMedia) {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
    }
    return () => {
      window.clearTimeout(t);
      mq?.removeEventListener('change', apply);
    };
  }, [pref]);

  return [pref, setPref];
}

export function AppearanceMenu({ value, onChange }: {
  value: Appearance; onChange: (a: Appearance) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = APPEARANCES.find((a) => a.id === value) ?? APPEARANCES[1]!;

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Appearance"
      >
        <span aria-hidden="true">{current.glyph}</span>
        <span className="menu-label">{current.label}</span>
      </button>

      {open && (
        <div className="menu-panel" role="menu" aria-label="Appearance">
          <div className="menu-head">Appearance</div>
          {APPEARANCES.map((a) => (
            <button
              key={a.id}
              role="menuitemradio"
              aria-checked={value === a.id}
              className="menu-item"
              onClick={() => { onChange(a.id); setOpen(false); }}
            >
              <span className="menu-glyph" aria-hidden="true">{a.glyph}</span>
              <span className="menu-text">
                <strong>{a.label}</strong>
                <span>{a.note}</span>
              </span>
              <span className="menu-check" aria-hidden="true">{value === a.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
