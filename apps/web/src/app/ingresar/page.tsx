import { Card, PageHeader } from '@encuentro/ui';
import type { Metadata } from 'next';

import { Shell } from '@/components/shell';
import { SignInForm } from '@/components/sign-in-form';

export const metadata: Metadata = {
  title: 'Ingresar',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <Shell title="Encuentro">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader title="Ingresar" />
        <Card>
          <SignInForm />
        </Card>
      </div>
    </Shell>
  );
}
