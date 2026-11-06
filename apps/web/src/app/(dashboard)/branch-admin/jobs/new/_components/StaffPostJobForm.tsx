import { StaffJobForm } from '@/app/(dashboard)/_components/jobs/StaffJobForm';

interface Props {
  companies: { id: string; name: string }[];
  categories: { code: string; label: string }[];
}

export function StaffPostJobForm({ companies, categories }: Props) {
  return (
    <div className="border-border bg-surface grid max-w-2xl gap-6 rounded-xl border p-6">
      {companies.length === 0 ? (
        <p className="text-fg-muted text-sm">
          No verified companies in your branch yet. Companies must be verified before you can post
          jobs for them.
        </p>
      ) : (
        <StaffJobForm
          companies={companies}
          categories={categories}
          redirectTo="/branch-admin/jobs"
        />
      )}
    </div>
  );
}
