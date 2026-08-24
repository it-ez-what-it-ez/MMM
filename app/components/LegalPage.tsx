export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="legal-page">
      <a className="wordmark" href="/">
        <span>G</span>
        <b>GrowthOS</b>
      </a>
      <article>
        <p className="kicker">GrowthOS</p>
        <h1>{title}</h1>
        <p className="muted">Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}
