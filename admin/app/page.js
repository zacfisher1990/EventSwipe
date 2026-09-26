'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const fmtAgo = (iso) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
};

const DAY = 86400000;

// lastActiveAt is written on each app open (newer builds); fall back to the
// Firebase Auth sign-in time for users who haven't updated yet.
const lastActive = (u) => u.lastActiveAt || u.lastSignIn;

const platformLabel = (u) => {
  if (u.platform === 'ios') return `iOS ${u.osVersion || ''}`.trim();
  if (u.platform === 'android') return u.osVersion ? `Android (API ${u.osVersion})` : 'Android';
  return u.platform;
};

const COLUMNS = [
  { key: 'email', label: 'User', sort: (u) => (u.email || '').toLowerCase() },
  { key: 'platform', label: 'Platform', sort: (u) => u.platform || '' },
  { key: 'createdAt', label: 'Joined', sort: (u) => u.createdAt || '' },
  { key: 'lastActive', label: 'Last active', sort: (u) => lastActive(u) || '' },
  { key: 'swipes', label: 'Swipes', num: true, sort: (u) => u.swipeCount ?? -1 },
  { key: 'split', label: 'Right / Left', num: true, sort: (u) => u.rightSwipes ?? -1 },
  { key: 'saved', label: 'Saved now', num: true, sort: (u) => u.savedEvents },
  { key: 'events', label: 'Events posted', num: true, sort: (u) => u.events.length },
];

export default function Dashboard() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <main className="center muted">Loading…</main>;
  if (!user) return <Login />;
  return <Overview user={user} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Sign-in failed. Use your EventSwipe account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center">
      <form className="card login" onSubmit={submit}>
        <h1>EventSwipe Admin</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Overview({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'lastActive', dir: -1 });
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/overview', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) {
        setError('forbidden');
      } else if (!res.ok) {
        setError(`Request failed (${res.status})`);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sort.key);
    return data.users
      .filter((u) => !q || (u.email || '').toLowerCase().includes(q) || u.uid.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [data, search, sort]);

  const totals = useMemo(() => {
    if (!data) return null;
    const u = data.users;
    const now = Date.now();
    const activeWithin = (days) =>
      u.filter((x) => lastActive(x) && now - new Date(lastActive(x)).getTime() < days * DAY).length;
    return {
      users: u.length,
      guests: u.filter((x) => x.isGuest).length,
      active7: activeWithin(7),
      active30: activeWithin(30),
      newThisWeek: u.filter((x) => x.createdAt && now - new Date(x.createdAt).getTime() < 7 * DAY).length,
      swipes: u.reduce((s, x) => s + (x.swipeCount || 0), 0),
      events: u.reduce((s, x) => s + x.events.length, 0),
      ios: u.filter((x) => x.platform === 'ios').length,
      android: u.filter((x) => x.platform === 'android').length,
      notifications: u.filter((x) => x.notifications).length,
    };
  }, [data]);

  if (error === 'forbidden') {
    return (
      <main className="center">
        <div className="card login">
          <h1>Not authorized</h1>
          <p>Add this UID to the <code>ADMIN_UIDS</code> environment variable, then redeploy:</p>
          <p><code className="uid">{user.uid}</code></p>
          <button onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </main>
    );
  }

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'email' ? 1 : -1 }));

  return (
    <main className="page">
      <header className="topbar">
        <h1>EventSwipe Admin</h1>
        <div className="actions">
          {data && <span className="muted small">Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
          <button className="ghost" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button className="ghost" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {totals && (
        <section className="tiles">
          <Tile
            label="Users"
            value={totals.users}
            sub={`+${totals.newThisWeek} this week · ${totals.guests} guests`}
          />
          <Tile label="Active (7d)" value={totals.active7} sub={`${totals.active30} in 30d`} />
          <Tile label="Swipes tracked" value={totals.swipes} sub="since counter launch" />
          <Tile label="Events posted" value={totals.events} />
          <Tile label="Notifications on" value={totals.notifications} />
          <Tile
            label="iOS / Android"
            value={`${totals.ios} / ${totals.android}`}
            sub={`${totals.users - totals.ios - totals.android} not yet reported`}
          />
        </section>
      )}

      {data && (
        <section className="card">
          <div className="tablebar">
            <input
              type="search"
              placeholder="Search email or UID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="muted small">{rows.length} of {data.users.length} users</span>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={c.num ? 'num' : ''} onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sort.key === c.key && <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <Fragment key={u.uid}>
                    <tr className="row" onClick={() => setExpanded(expanded === u.uid ? null : u.uid)}>
                      <td>
                        <div className="email">
                          {u.email || <span className="muted">{u.isGuest ? 'Guest' : 'no email'}</span>}
                        </div>
                        <div className="muted small mono">{u.uid}</div>
                        {u.isGuest && <span className="badge">guest</span>}
                        {u.disabled && <span className="badge warn">disabled</span>}
                        {u.deletedFromAuth && <span className="badge warn">no auth account</span>}
                      </td>
                      <td>{u.platform ? platformLabel(u) : <span className="muted">—</span>}</td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>{fmtAgo(lastActive(u))}</td>
                      <td className="num">
                        {u.swipeCount != null ? (
                          u.swipeCount
                        ) : (
                          <span className="muted" title="No counter yet — number of distinct event IDs swiped (approximate)">
                            ~{u.swipedEventIds}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {u.swipeCount != null ? `${u.rightSwipes ?? 0} / ${u.leftSwipes ?? 0}` : <span className="muted">—</span>}
                      </td>
                      <td className="num">{u.savedEvents}</td>
                      <td className="num">{u.events.length || <span className="muted">0</span>}</td>
                    </tr>
                    {expanded === u.uid && (
                      <tr className="detail">
                        <td colSpan={COLUMNS.length}>
                          <UserDetail u={u} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data?.orphanEvents?.length > 0 && (
        <section className="card">
          <h2>Events without a known poster ({data.orphanEvents.length})</h2>
          <EventList events={data.orphanEvents} />
        </section>
      )}
    </main>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="card tile">
      <div className="muted small">{label}</div>
      <div className="big">{value.toLocaleString()}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

function UserDetail({ u }) {
  return (
    <div className="detailbox">
      <div className="facts">
        <span>Last swipe: <b>{fmtAgo(u.lastSwipeAt)}</b></span>
        <span>Last sign-in: <b>{fmtAgo(u.lastSignIn)}</b></span>
        <span>Notifications: <b>{u.notifications ? 'on' : 'off'}</b></span>
        <span>Distinct events swiped: <b>{u.swipedEventIds}</b></span>
        <span>Currently saved: <b>{u.savedEvents}</b></span>
      </div>
      {u.events.length ? <EventList events={u.events} /> : <p className="muted">No events posted.</p>}
    </div>
  );
}

function EventList({ events }) {
  return (
    <table className="events">
      <thead>
        <tr>
          <th>Event</th>
          <th>Date</th>
          <th>Posted</th>
          <th className="num">Views</th>
          <th className="num">Saves</th>
          <th className="num">Ticket taps</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id}>
            <td>
              <div>{e.title}</div>
              <div className="muted small">{[e.category, e.location].filter(Boolean).join(' · ')}</div>
            </td>
            <td>{e.date || '—'}</td>
            <td>{fmtDate(e.createdAt)}</td>
            <td className="num">{e.views}</td>
            <td className="num">{e.saves}</td>
            <td className="num">{e.ticketTaps}</td>
            <td>
              <span className={`badge ${e.active ? 'ok' : ''}`}>{e.active ? 'active' : 'inactive'}</span>
              {e.status && <span className="badge warn">{e.status.replace('_', ' ')}</span>}
              {e.reportCount > 0 && <span className="badge warn">{e.reportCount} reports</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
