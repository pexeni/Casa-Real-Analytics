import { signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Ingresar — Casa Real Analytics' };

export default function LoginPage() {
  async function handleSignIn(formData: FormData) {
    'use server';
    const email = formData.get('email');
    if (typeof email !== 'string' || !email) return;
    await signIn('resend', { email, redirectTo: '/reportes' });
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Casa Real Analytics</CardTitle>
          <CardDescription>
            Ingresá con tu correo. Te enviaremos un enlace para acceder.
          </CardDescription>
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
            <Button type="submit">Enviar enlace</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
