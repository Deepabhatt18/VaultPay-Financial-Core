import Link from 'next/link';
import type { SessionUser } from '@/lib/types';
import LogoutButton from './LogoutButton';

export default function AppHeader({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'ADMIN';
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={isAdmin ? '/admin/dashboard' : '/dashboard'} className="brand">
          <span className="brand-mark" aria-hidden /> VaultPay
        </Link>
        <nav className="nav" aria-label="Main">
          {isAdmin ? (
            <>
              <Link href="/admin/dashboard">Dashboard</Link>
              <Link href="/admin/invoices/new">New invoice</Link>
              <Link href="/admin/clients/new">New client</Link>
            </>
          ) : (
            <Link href="/dashboard">My invoices</Link>
          )}
        </nav>
        <div className="who">
          <span>
            <strong>{user.name}</strong> <span className="muted">· {user.company}</span>
          </span>
          <span className="role-pill">{user.role}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
