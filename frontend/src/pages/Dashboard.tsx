import React, { useEffect, useState } from 'react';
import { api } from '../api/axios';

export default function Dashboard() {
  const [counts, setCounts] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [autoClosed, setAutoClosed] = useState<any[]>([]);

  useEffect(() => {
    api.get('/alerts/dashboard/counts').then(r => setCounts(r.data)).catch(console.error);
    api.get('/alerts/dashboard/top-offenders').then(r => setTop(r.data)).catch(console.error);
    api.get('/alerts/dashboard/auto-closed').then(r => setAutoClosed(r.data)).catch(console.error);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Alert Dashboard</h1>
      <section>
        <h2>Counts</h2>
        <pre>{JSON.stringify(counts, null, 2)}</pre>
      </section>
      <section>
        <h2>Top Offenders</h2>
        <ul>{top.map((t:any) => <li key={t.entityId}>{t.entityId} — {t.cnt}</li>)}</ul>
      </section>
      <section>
        <h2>Recent Auto-Closed</h2>
        <ul>{autoClosed.map((a:any) => <li key={a.id}>{a.alertId} — {a.sourceType} — {a.status}</li>)}</ul>
      </section>
    </div>
  );
}
