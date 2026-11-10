import { requireRole } from '@/domains/auth';
import { JOB_SORTABLE, jobFilters, listJobs } from '@/domains/job';
import { JobManagementPanel } from '@/app/(dashboard)/_components/jobs/JobManagementPanel';
import { listCompanies } from '@/domains/company';
import { listMasterData } from '@/domains/settings';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@jobbank/shared';
import { parseListQuery } from '@/domains/shared/pagination';
import { BranchListControls, branchListParams } from '../_components/BranchListControls';

export const metadata = { title: 'Jobs' };

export default async function BranchAdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireRole('BRANCH_ADMIN');
  const params = branchListParams(await searchParams);
  const query = parseListQuery(params, {
    sortable: JOB_SORTABLE,
    defaultSort: { field: 'createdAt', direction: 'desc' },
    filters: jobFilters,
  });
  const [jobList, allJobs, companyList, categories] = await Promise.all([
    listJobs(actor, query),
    listJobs(actor, {
      ...query,
      q: undefined,
      filters: {},
      page: 1,
      limit: 1,
      pageSize: 1,
      offset: 0,
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
    <>
      <BranchListControls
        action="/branch-admin/jobs"
        params={params}
        meta={jobList.pagination}
        label="jobs"
        statuses={JOB_STATUSES.map((status) => ({
          value: status,
          label: JOB_STATUS_LABELS[status],
        }))}
      />
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
        jobBasePath="/branch-admin/jobs"
        totalCount={allJobs.pagination.total}
      />
    </>
  );
}
