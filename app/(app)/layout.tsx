import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <Link href="/reportes" className="font-semibold">
            Casa Real Analytics
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/reportes">Reportes</Link>
            <Link href="/conceptos">Conceptos</Link>
            <span className="text-muted-foreground">{session?.user?.email}</span>
            <form action={handleSignOut}>
              <Button type="submit" variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </>
  );
}
