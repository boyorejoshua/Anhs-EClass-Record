/**
 * The honest dead end.
 *
 * The brief's rule: a navigation item either opens a working screen, or
 * says plainly that it does not exist yet. What it must never do is look
 * like it worked while showing something else — which is exactly what
 * the audit found, because `navKey` was consulted in one place and every
 * other menu entry fell through to the dashboard.
 *
 * So this screen is deliberately not a shrug. It names the feature, says
 * what it depends on, and points at the document where the design lives.
 * A registrar who clicks Enrollments should leave knowing why it is not
 * there and roughly when it will be — not wondering whether they
 * misclicked.
 */
export function NotAvailable({ title, note, docHint }: {
  title: string;
  note?: string;
  docHint?: string;
}) {
  return (
    <div className="page">
      <div className="panel">
        <div className="na">
          <span className="na-tag">Not available yet</span>
          <h2>{title}</h2>
          <p>
            {note ??
              'This part of the platform is designed but not built. It is reachable ' +
              'from the menu so the shape of the product is visible, and it will not ' +
              'pretend to work in the meantime.'}
          </p>
          {docHint && <p className="na-doc">{docHint}</p>}
        </div>
      </div>
    </div>
  );
}
