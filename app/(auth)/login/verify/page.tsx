export const metadata = { title: 'Revisá tu correo — Casa Real Analytics' };

export default function VerifyPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Revisá tu correo</h1>
        <p className="mt-2 text-muted-foreground">
          Te enviamos un enlace de acceso. Hacé clic en él para ingresar.
        </p>
      </div>
    </main>
  );
}
