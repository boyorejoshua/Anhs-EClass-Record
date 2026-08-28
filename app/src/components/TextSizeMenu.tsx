import { useEffect, useRef, useState } from 'react';

export type TextSize = 'standard' | 'large' | 'largest';

const KEY = 'mendtrix.textsize';

/**
 * The base font size each step sets, in px. Every other size in the
 * interface is a ratio of this one (see the --fs-* scale in tokens.css),
 * so one number moves the whole product in proportion.
 *
 * 16 / 18 / 20 rather than a percentage zoom: browser zoom scales the
 * layout too, and hands you a wider sidebar and fatter buttons along
 * with the bigger words. What an older reader needs is bigger WORDS in
 * the same layout.
 */
export const TEXT_SIZES: Array<{
  id: TextSize; label: string; note: string; px: number;
}> = [
  { id: 'standard', label: 'Standard', note: 'The default',                px: 16 },
  { id: 'large',    label: 'Large',    note: 'About an eighth bigger',     px: 18 },
  { id: 'largest',  label: 'Largest',  note: 'A quarter bigger — easiest', px: 20 },
];

/**
 * Text size, as a real per-person preference.
 *
 * This exists because the product is for public school teachers, and a
 * good share of them are over fifty. Presbyopia is not a minority
 * accommodation in that population — it is the median. The right
 * response is not to pick one bigger number and hope; it is to let the
 * person reading choose, AND to make the default legible for the person
 * who never opens this menu. Both, not either.
 *
 * Stored per browser rather than on the account on purpose: it describes
 * the SCREEN, not the person. A teacher projecting at a faculty meeting
 * and the same teacher on their own laptop want different answers, and
 * syncing the preference would guarantee one of them is wrong.
 */
export function useTextSize(): [TextSize, (t: TextSize) => void] {
  const [pref, setPref] = useState<TextSize>(() => {
    try {
      const saved = localStorage.getItem(KEY) as TextSize | null;
      if (saved && TEXT_SIZES.some((t) => t.id === saved)) return saved;
    } catch { /* private mode or blocked storage — fall through to default */ }
    return 'standard';
  });

  useEffect(() => {
    const chosen = TEXT_SIZES.find((t) => t.id === pref) ?? TEXT_SIZES[0]!;
    // Setting the custom property rather than swapping a class keeps the
    // scale one arithmetic chain, so no size is written three times.
    document.documentElement.style.setProperty('--fs-base', `${chosen.px}px`);
    // Also stamped as an attribute, for the few rules that need to know
    // a step has been taken — and so a test can assert it.
    document.documentElement.setAttribute('data-text-size', pref);
    try { localStorage.setItem(KEY, pref); } catch { /* non-fatal */ }
  }, [pref]);

  return [pref, setPref];
}

export function TextSizeMenu({ value, onChange }: {
  value: TextSize; onChange: (t: TextSize) => void;
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

  const current = TEXT_SIZES.find((t) => t.id === value) ?? TEXT_SIZES[0]!;

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Text size"
      >
        <span aria-hidden="true" className="ts-glyph">A</span>
        <span className="menu-label">{current.label}</span>
      </button>

      {open && (
        <div className="menu-panel" role="menu" aria-label="Text size">
          <div className="menu-head">Text size</div>
          {TEXT_SIZES.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={value === t.id}
              className="menu-item"
              onClick={() => { onChange(t.id); setOpen(false); }}
            >
              {/*
                Each option is SET IN ITS OWN SIZE. A menu that describes
                three text sizes all in one text size asks the reader to
                imagine the thing they are choosing. Showing it is easier
                and more honest — and this is the one menu in the product
                whose whole subject is how big text is.
              */}
              <span className="menu-glyph" aria-hidden="true"
                    style={{ fontSize: `${t.px}px`, lineHeight: 1 }}>A</span>
              <span className="menu-text">
                <strong style={{ fontSize: `${t.px}px` }}>{t.label}</strong>
                <span>{t.note}</span>
              </span>
              <span className="menu-check" aria-hidden="true">{value === t.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
