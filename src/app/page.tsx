import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard');
}
