import { requireRole } from '@/domains/auth';
import { listJobs } from '@/domains/job';
import { JobManagementPanel } from '@/app/(dashboard)/_components/jobs/JobManagementPanel';
import { listCompanies } from '@/domains/company';
import { listMasterData } from '@/domains/settings';

export const metadata = { title: 'Jobs' };

export default async function SuperAdminJobsPage() {
  const { actor } = await requireRole('SUPER_ADMIN');
  const [jobList, companyList, categories] = await Promise.all([
    listJobs(actor, {
      page: 1,
      pageSize: 100,
      limit: 100,
      offset: 0,
      sort: { field: 'createdAt', direction: 'desc' },
      q: undefined,
      filters: {},
    }),
    listCompanies(actor, {
      page: 1,
      pageSize: 200,
      limit: 200,
      offset: 0,
      sort: { field: 'legalName', direction: 'asc' },
      q: undefined,
      filters: { status: 'VERIFIED' },
    }),
    listMasterData(actor, { type: 'JOB_CATEGORY' }),
  ]);
  return (
    <JobManagementPanel
      jobs={jobList.items}
      companies={companyList.items.map((company) => ({
        id: company.id,
        name: company.legalName,
      }))}
      categories={categories.map((category) => ({
        code: category.code,
        label: category.label,
      }))}
      canManage={actor.permissions.has('job:manage')}
      jobBasePath="/super-admin/jobs"
      totalCount={jobList.pagination.total}
    />
  );
}
