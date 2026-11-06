import { z } from 'zod';
import { createApplicantRegistrationForm } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

export const POST = apiHandler({
  permission: 'applicant:read',
  params: z.object({ id: z.uuid() }),
  handler: async ({ ctx, actor, params }) =>
    ok(await createApplicantRegistrationForm({ ...ctx, actor: actor! }, params.id)),
});
