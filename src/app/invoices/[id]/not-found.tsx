import Link from 'next/link';

export default function InvoiceNotFound() {
  return (
    <main className="center-screen">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <h1>Invoice not found</h1>
        <p className="muted">It may not exist, or you may not have access to it.</p>
        <Link className="btn" href="/">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
