import type { JobStatus } from '@jobbank/shared';

export type JobEditability = 'editable' | 'read_only';

export function jobEditability(status: JobStatus): JobEditability {
  return status === 'DRAFT' ? 'editable' : 'read_only';
}

export { allowedTransitions, type JobStatusTransition } from '@jobbank/shared';
