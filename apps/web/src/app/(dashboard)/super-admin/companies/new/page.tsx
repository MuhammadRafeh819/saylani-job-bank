import { requireRole } from '@/domains/auth';
import { listBranches } from '@/domains/branch';
import { listMasterData } from '@/domains/settings';
import { StaffRegisterCompanyForm } from '@/app/(dashboard)/branch-admin/companies/new/_components/StaffRegisterCompanyForm';

export const metadata = { title: 'Add company' };

export default async function SuperAdminAddCompanyPage() {
  const { actor } = await requireRole('SUPER_ADMIN');
  const [branches, industries] = await Promise.all([
    listBranches(actor),
    listMasterData(actor, { type: 'INDUSTRY' }),
  ]);

  return (
    <div className="grid w-full gap-6">
      <header>
        <h1 className="text-fg text-2xl font-semibold">Add company</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Register a company on behalf of an employer and assign it to a branch.
        </p>
      </header>
      <StaffRegisterCompanyForm
        branches={branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
        industries={industries.map((i) => ({ code: i.code, label: i.label }))}
        companiesPath="/super-admin/companies"
      />
    </div>
  );
}
