import { requireRole } from '@/domains/auth';
import { getJobDetail } from '@/domains/job';
import { NotFoundError } from '@/domains/shared/errors';
import { notFound } from 'next/navigation';
import { BranchJobDetail } from '../../_components/BranchJobDetail';

export const metadata = { title: 'Job detail' };

export default async function BranchAdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { actor } = await requireRole('BRANCH_ADMIN');
  const { id } = await params;

  try {
    const job = await getJobDetail(actor, id);
    return <BranchJobDetail job={job} />;
  } catch (e) {
    if (e instanceof NotFoundError) return notFound();
    throw e;
  }
}
