export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f7f6", color: "#17221f" }}>
      <section style={{ width: "100%", maxWidth: 520, background: "white", border: "1px solid #dce5e2", borderRadius: 16, padding: 32 }}>
        <p style={{ color: "#087f72", fontWeight: 700 }}>GrowthOS</p>
        <h1>Stop marketing emails</h1>
        <p>Confirm below. Visiting this page alone never changes your subscription, which prevents email security scanners from opting you out accidentally.</p>
        {token ? (
          <form action="/api/v1/unsubscribe" method="post">
            <input type="hidden" name="token" value={token} />
            <button type="submit" style={{ border: 0, borderRadius: 8, padding: "12px 18px", background: "#087f72", color: "white", fontWeight: 700 }}>Unsubscribe</button>
          </form>
        ) : <p>This unsubscribe link is incomplete.</p>}
      </section>
    </main>
  );
}
