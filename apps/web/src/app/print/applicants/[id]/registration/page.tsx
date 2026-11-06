import type { Metadata } from 'next';
import { requireRole } from '@/domains/auth';
import { RegistrationPrintClient } from './RegistrationPrintClient';

export const metadata: Metadata = {
  title: 'Print registration form',
  robots: { index: false, follow: false },
};

export default async function RegistrationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF');
  const { id } = await params;
  return <RegistrationPrintClient applicantId={id} />;
}
