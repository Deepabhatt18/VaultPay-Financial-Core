// End-to-end security checks against a RUNNING server.
//   BASE_URL=http://localhost:3000 npm run security-check
// Needs demo data (SEED_DEMO_DATA) and mock payments (no STRIPE_SECRET_KEY) so a payment can be simulated.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ORIGIN = new URL(BASE).origin;

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, cookie };
}

const api = (cookie, path, init = {}) =>
  fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...init,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.method && init.method !== 'GET' ? { Origin: ORIGIN } : {}), ...(init.headers || {}) },
  });

const admin = await login('admin@nexus-corp.example', 'Admin#Vault2026');
const acme = await login('daniel@acme-industries.example', 'Client#Acme2026');
check('admin can log in', admin.res.ok && admin.cookie.startsWith('vp_session='));
check('client can log in', acme.res.ok && acme.cookie.startsWith('vp_session='));
check('wrong password rejected (401)', (await login('daniel@acme-industries.example', 'nope')).res.status === 401);
check('unknown user gives same 401', (await login('ghost@x.example', 'nope')).res.status === 401);

console.log('\nRoute guards');
let r = await api('', '/dashboard');
check('anonymous /dashboard -> redirect to /login', r.status === 307 && r.headers.get('location')?.includes('/login'));
r = await api('', '/api/invoices');
check('anonymous API -> 401', r.status === 401);
r = await api(acme.cookie, '/admin/dashboard');
check('CLIENT typing /admin/dashboard -> redirect to /403', r.status === 307 && r.headers.get('location')?.endsWith('/403'));
r = await api(acme.cookie, '/admin/invoices/new');
check('CLIENT /admin/invoices/new -> /403', r.status === 307 && r.headers.get('location')?.endsWith('/403'));
r = await api(acme.cookie, '/api/admin/clients');
check('CLIENT admin API -> 403', r.status === 403);
r = await api(admin.cookie, '/admin/dashboard');
check('ADMIN /admin/dashboard -> 200', r.status === 200);
r = await api('vp_session=forged.token.value', '/admin/dashboard');
check('forged cookie -> redirect to /login', r.status === 307 && r.headers.get('location')?.includes('/login'));

console.log('\nData isolation');
const all = (await (await api(admin.cookie, '/api/invoices')).json()).invoices;
const mine = (await (await api(acme.cookie, '/api/invoices')).json()).invoices;
const foreign = all.find((i) => i.clientId !== 'usr_acme');
const own = mine.find((i) => i.status !== 'PAID');
check('admin sees all clients', new Set(all.map((i) => i.clientId)).size > 1);
check('client list contains ONLY own invoices', mine.length > 0 && mine.every((i) => i.clientId === 'usr_acme'));
r = await api(acme.cookie, `/api/invoices/${foreign.id}`);
check("client cannot read another client's invoice (404)", r.status === 404);
r = await api(acme.cookie, `/api/invoices/${foreign.id}/pdf`);
check("client cannot download another client's PDF (404)", r.status === 404);
r = await api(acme.cookie, `/invoices/${foreign.id}`);
check("client page for another client's invoice does not render it", !(await r.text()).includes(foreign.number));
r = await api(acme.cookie, `/api/invoices/${foreign.id}/checkout`, { method: 'POST' });
check("client cannot pay another client's invoice (404)", r.status === 404);
r = await api(admin.cookie, `/api/invoices/${own.id}/checkout`, { method: 'POST' });
check('admin cannot pay on behalf of a client (403)', r.status === 403);

console.log('\nDocument vault');
r = await api(acme.cookie, `/api/invoices/${own.id}/pdf`);
const buf = Buffer.from(await r.arrayBuffer());
check('own invoice PDF is a real PDF with attachment header', r.status === 200 && buf.subarray(0, 4).toString() === '%PDF' && /attachment/.test(r.headers.get('content-disposition') || ''));

console.log('\nCSRF / tampering');
r = await fetch(`${BASE}/api/invoices/${own.id}/checkout`, { method: 'POST', headers: { Cookie: acme.cookie } });
check('POST without Origin blocked (403)', r.status === 403);
r = await fetch(`${BASE}/api/invoices/${own.id}/checkout`, { method: 'POST', headers: { Cookie: acme.cookie, Origin: 'https://evil.example' } });
check('POST from foreign Origin blocked (403)', r.status === 403);
r = await api(acme.cookie, '/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
check('CLIENT cannot create invoices (403)', r.status === 403);
r = await api(admin.cookie, '/api/admin/invoices', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientId: 'usr_acme', dueDate: '2030-01-01', items: [{ description: 'x', quantity: 1, unitCents: -5 }] }),
});
check('negative amount rejected (400)', r.status === 400);
r = await fetch(`${BASE}/api/webhooks/stripe`, { method: 'POST', body: '{"type":"checkout.session.completed"}' });
check('unsigned webhook cannot mark anything paid (400/503)', r.status === 400 || r.status === 503);

console.log('\nPayments (double-click safety)');
const burst = await Promise.all(Array.from({ length: 12 }, () => api(acme.cookie, `/api/invoices/${own.id}/checkout`, { method: 'POST' })));
const bodies = await Promise.all(burst.map((x) => x.json()));
const urls = new Set(bodies.map((b) => b.url));
check('12 simultaneous clicks -> all succeed', burst.every((x) => x.status === 200));
check('12 simultaneous clicks -> exactly ONE checkout session', urls.size === 1, `(got ${urls.size})`);

const mockUrl = [...urls][0];
if (mockUrl?.startsWith('/pay/mock')) {
  const sessionId = new URL(mockUrl, BASE).searchParams.get('session');
  const complete = () =>
    api(acme.cookie, '/api/mock/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: own.id, sessionId }) });
  const done = await Promise.all([complete(), complete(), complete()]);
  const stat = done.map((x) => x.status).sort();
  check('3 simultaneous completions -> one 200, rest 409', stat.filter((s) => s === 200).length === 1 && stat.filter((s) => s === 409).length === 2, JSON.stringify(stat));
  const after = await (await api(acme.cookie, `/api/invoices/${own.id}`)).json();
  check('invoice is PAID after payment', after.invoice.status === 'PAID');
  r = await api(acme.cookie, `/api/invoices/${own.id}/checkout`, { method: 'POST' });
  check('cannot start checkout on a paid invoice (409)', r.status === 409);
  r = await api(acme.cookie, `/api/invoices/${own.id}/receipt`);
  check('receipt PDF available once paid', r.status === 200 && r.headers.get('content-type') === 'application/pdf');
} else {
  console.log('  (skipped mock-payment checks: server is using real Stripe)');
}
r = await api(acme.cookie, '/api/mock/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: foreign.id, sessionId: 'x' }) });
check("cannot 'complete' a payment for someone else's invoice", r.status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
