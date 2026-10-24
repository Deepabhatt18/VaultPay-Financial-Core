import { handle, json, requireApiUser } from '@/lib/http';

export const runtime = 'nodejs';

/** Who am I? The frontend route guard calls this with the browser's cookie. 401 when not signed in. */
export const GET = handle(async () => {
  const user = await requireApiUser();
  return json({ user });
});
