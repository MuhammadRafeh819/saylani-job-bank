import 'server-only';
import {
  JOB_STATUSES,
  type CreateJobInput,
  type JobType,
  type JobStatus,
  type JobStatusInput,
  type UpdateJobInput,
} from '@jobbank/shared';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import { ForbiddenError, NotFoundError } from '@/domains/shared/errors';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import {
  assertBranchAccess,
  assertPermission,
  branchScope,
  hasPermission,
  isSuperAdmin,
  type Actor,
} from '@/domains/shared/scope';
import { db } from '@/lib/db';
import type { RequestContext } from '@/domains/shared/audit';
import { schema } from '@jobbank/db';
import { buildJobView, j, loadJob, type JobView } from './repository';
import { jobMachine } from './machine';

type SignedIn = RequestContext & { actor: Actor };

// ─── Listing ─────────────────────────────────────────────────────────────

export const JOB_SORTABLE = ['title', 'createdAt', 'status', 'vacancies'] as const;

export const jobFilters = {
  status: z.enum(JOB_STATUSES).optional(),
  companyId: z.uuid().optional(),
  branchId: z.uuid().optional(),
};

export interface JobListItem {
  id: string;
  companyId: string;
  companyName: string;
  branchId: string;
  title: string;
  categoryCode: string;
  description: string;
  jobType: JobType;
  shift: JobView['shift'];
  genderPreference: JobView['genderPreference'];
  vacancies: number;
  vacanciesFilled: number;
  salaryMin: number | null;
  salaryMax: number | null;
  status: JobStatus;
  publishedAt: string | null;
  createdAt: string;
}

export async function listJobs(
  actor: Actor,
  query: ListQuery<
    (typeof JOB_SORTABLE)[number],
    { status?: JobStatus; companyId?: string; branchId?: string }
  >,
) {
  assertPermission(actor, 'job:read');
  const f = query.filters;

  const conditions: SQL[] = [];

  // Branch scope — branchScope returns undefined (all) or a SQL condition
  const scopeCondition = branchScope(actor, j.branchId);
  if (scopeCondition) conditions.push(scopeCondition);

  if (f.status) conditions.push(eq(j.status, f.status));
  if (f.companyId) conditions.push(eq(j.companyId, f.companyId));
  if (f.branchId) {
    if (!isSuperAdmin(actor)) assertBranchAccess(actor, f.branchId);
    conditions.push(eq(j.branchId, f.branchId));
  }
  if (query.q) {
    const like = `%${query.q}%`;
    conditions.push(or(ilike(j.title, like), ilike(j.categoryCode, like))!);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const sortCol = {
    title: j.title,
    createdAt: j.createdAt,
    status: j.status,
    vacancies: j.vacancies,
  }[query.sort.field];
  const orderBy = query.sort.direction === 'asc' ? asc(sortCol) : desc(sortCol);

  const [[totRow], rows] = await Promise.all([
    db.select({ total: count() }).from(j).where(where),
    db
      .select({
        id: j.id,
        companyId: j.companyId,
        companyName: schema.companies.legalName,
        branchId: j.branchId,
        title: j.title,
        categoryCode: j.categoryCode,
        description: j.description,
        jobType: j.jobType,
        shift: j.shift,
        genderPreference: j.genderPreference,
        vacancies: j.vacancies,
        vacanciesFilled: j.vacanciesFilled,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        status: j.status,
        publishedAt: j.publishedAt,
        createdAt: j.createdAt,
      })
      .from(j)
      .innerJoin(schema.companies, eq(schema.companies.id, j.companyId))
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(query.offset),
  ]);

  const items: JobListItem[] = rows.map((r) => ({
    ...r,
    status: r.status as JobStatus,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, pagination: paginationMeta(query, totRow?.total ?? 0) };
}

// ─── Detail ───────────────────────────────────────────────────────────────

export async function getJobDetail(actor: Actor, jobId: string): Promise<JobView> {
  assertPermission(actor, 'job:read');
  const row = await loadJob(db, jobId);
  // For detail, we check manually since branchScope works on queries
  if (!isSuperAdmin(actor)) {
    // assertBranchAccess throws if actor can't see that branch
    try {
      assertBranchAccess(actor, row.branchId);
    } catch {
      throw new ForbiddenError('Job is not in your branch');
    }
  }
  return buildJobView(db, row);
}

/** Lists only jobs belonging to an accessible company and branch. */
export async function listCompanyJobs(actor: Actor, companyId: string): Promise<JobView[]> {
  assertPermission(actor, 'job:read');
  const [company] = await db
    .select({ branchId: schema.companies.branchId })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId));
  if (!company) throw new NotFoundError('Company', companyId);
  assertBranchAccess(actor, company.branchId, {
    entityType: 'company',
    entityId: companyId,
  });

  const scope = branchScope(actor, j.branchId);
  const rows = await db
    .select()
    .from(j)
    .where(and(eq(j.companyId, companyId), scope))
    .orderBy(desc(j.createdAt));
  return Promise.all(rows.map((row) => buildJobView(db, row)));
}

// ─── Staff job creation ───────────────────────────────────────────────────

/** An authorized administrator posts a draft job on behalf of a verified company. */
export async function staffCreateJob(
  ctx: SignedIn,
  companyId: string,
  input: CreateJobInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage');
  return runCommand(ctx, async ({ tx, audit }) => {
    const [company] = await tx
      .select({
        id: schema.companies.id,
        branchId: schema.companies.branchId,
        status: schema.companies.status,
      })
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId))
      .for('update');
    if (!company) throw new NotFoundError('Company', companyId);
    if (company.status !== 'VERIFIED')
      throw new ForbiddenError('Jobs can only be posted for verified companies');
    if (!company.branchId) throw new ForbiddenError('Company has no branch assigned');
    if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, company.branchId);

    const [row] = await tx
      .insert(j)
      .values({
        companyId: company.id,
        branchId: company.branchId,
        title: input.title,
        categoryCode: input.categoryCode,
        description: input.description,
        jobType: input.jobType,
        shift: input.shift,
        genderPreference: input.genderPreference ?? 'ANY',
        vacancies: input.vacancies,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        status: 'DRAFT',
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        createdBy: ctx.actor.userId,
      })
      .returning();
    audit({
      action: 'job.staff_create',
      entityType: 'job',
      entityId: row!.id,
      branchId: company.branchId,
    });
    return row!;
  }).then((row) => buildJobView(db, row));
}

// ─── Staff status override ────────────────────────────────────────────────

export async function forceCloseJob(ctx: SignedIn, jobId: string, note?: string): Promise<JobView> {
  if (!hasPermission(ctx.actor, 'company:manage') && !hasPermission(ctx.actor, 'company:read')) {
    throw new ForbiddenError('Only branch staff can force-close jobs');
  }

  return runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadJob(tx, jobId, { forUpdate: true });
    const check = jobMachine.check(row.status, 'CLOSE', {}, ctx.actor.roles);
    if (!check.ok) throw new ForbiddenError(check.message);

    const [updated] = await tx
      .update(j)
      .set({ status: 'CLOSED', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(j.id, jobId))
      .returning();

    audit({
      action: 'job.staff_close',
      entityType: 'job',
      entityId: jobId,
      before: { status: row.status },
      after: { status: 'CLOSED' },
      reason: note ?? null,
    });
    return updated!;
  }).then((row) => buildJobView(db, row));
}

async function assertStaffJobAccess(ctx: SignedIn, jobId: string, companyScopeId?: string) {
  const row = await loadJob(db, jobId);
  if (companyScopeId && row.companyId !== companyScopeId) {
    throw new NotFoundError('Job', jobId);
  }
  if (!isSuperAdmin(ctx.actor)) assertBranchAccess(ctx.actor, row.branchId);
  return row;
}

/** Updates a staff-created vacancy while retaining its company and branch ownership. */
export async function staffUpdateJob(
  ctx: SignedIn,
  jobId: string,
  input: UpdateJobInput,
  companyScopeId?: string,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage');
  if (Object.keys(input).length === 0) {
    return buildJobView(db, await assertStaffJobAccess(ctx, jobId, companyScopeId));
  }

  const updated = await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadJob(tx, jobId, { forUpdate: true });
    if (companyScopeId && row.companyId !== companyScopeId) {
      throw new NotFoundError('Job', jobId);
    }
    if (!isSuperAdmin(ctx.actor)) {
      assertBranchAccess(ctx.actor, row.branchId, {
        entityType: 'job',
        entityId: row.id,
      });
    }
    if (['FILLED', 'CLOSED', 'EXPIRED'].includes(row.status)) {
      throw new ForbiddenError('A completed job cannot be edited');
    }

    const before = Object.fromEntries(
      Object.keys(input).map((field) => [field, row[field as keyof typeof row]]),
    );
    const [saved] = await tx
      .update(j)
      .set({
        ...input,
        closesAt:
          input.closesAt === undefined
            ? undefined
            : input.closesAt
              ? new Date(input.closesAt)
              : null,
        updatedAt: new Date(),
      })
      .where(eq(j.id, jobId))
      .returning();
    audit({
      action: 'job.staff_update',
      entityType: 'job',
      entityId: jobId,
      branchId: row.branchId,
      before,
      after: saved,
    });
    return saved!;
  });
  return buildJobView(db, updated);
}

/** Staff can archive jobs, while publication remains employer-controlled. */
export async function staffChangeJobStatus(
  ctx: SignedIn,
  jobId: string,
  input: JobStatusInput,
  companyScopeId?: string,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage');
  if (input.status !== 'CLOSED') {
    throw new ForbiddenError('Staff can archive jobs, but publication remains employer-controlled');
  }

  const updated = await runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadJob(tx, jobId, { forUpdate: true });
    if (companyScopeId && row.companyId !== companyScopeId) {
      throw new NotFoundError('Job', jobId);
    }
    if (!isSuperAdmin(ctx.actor)) {
      assertBranchAccess(ctx.actor, row.branchId, {
        entityType: 'job',
        entityId: row.id,
      });
    }
    if (['FILLED', 'CLOSED', 'EXPIRED'].includes(row.status)) {
      throw new ForbiddenError('A completed job cannot be archived');
    }

    const [saved] = await tx
      .update(j)
      .set({ status: 'CLOSED', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(j.id, jobId))
      .returning();
    audit({
      action: 'job.staff_status',
      entityType: 'job',
      entityId: jobId,
      branchId: row.branchId,
      before: { status: row.status },
      after: { status: 'CLOSED' },
      reason: input.note ?? null,
    });
    return saved!;
  });
  return buildJobView(db, updated);
}
