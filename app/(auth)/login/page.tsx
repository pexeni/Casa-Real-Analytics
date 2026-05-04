import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Ingresar — Casa Real Analytics' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function handleSignIn(formData: FormData) {
    'use server';
    const email = formData.get('email');
    const password = formData.get('password');
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      redirect('/login?error=invalid');
    }
    try {
      await signIn('credentials', { email, password, redirectTo: '/reportes' });
    } catch (e) {
      // signIn throws a NEXT_REDIRECT on success — re-throw so it propagates.
      if (e instanceof AuthError) {
        redirect('/login?error=invalid');
      }
      throw e;
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Casa Real Analytics</CardTitle>
          <CardDescription>Ingresá con tu correo y contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSignIn} className="flex flex-col gap-3">
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="tu@correo.com"
            />
            <Input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Contraseña"
            />
            {error && (
              <p className="text-sm text-destructive">Credenciales inválidas.</p>
            )}
            <Button type="submit">Ingresar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
