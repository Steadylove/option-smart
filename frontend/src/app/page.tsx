'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import LandingPage from '@/components/landing-page';

export default function RootPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, []);

  if (authed === null) return null;

  if (authed) {
    router.replace('/dashboard');
    return null;
  }

  return <LandingPage />;
}
