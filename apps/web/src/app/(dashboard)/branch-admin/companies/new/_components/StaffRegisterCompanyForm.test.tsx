import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiClientModule from '@/lib/api/client';
import type * as MoleculesModule from '@/components/molecules';
import { StaffRegisterCompanyForm } from './StaffRegisterCompanyForm';

const { apiFetchMock, pushMock, successMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('@/components/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof MoleculesModule>();
  return { ...actual, toast: { ...actual.toast, success: successMock } };
});

const branches = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Karachi Gulshan' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Lahore Johar' },
];
const khiBranchId = branches[0]!.id;
const lhrBranchId = branches[1]!.id;
const industries = [{ code: 'RETAIL', label: 'Retail' }];

describe('StaffRegisterCompanyForm', () => {
  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ data: { id: 'company-1' } });
    pushMock.mockReset();
    successMock.mockReset();
  });

  it.each([
    ['/branch-admin/companies', khiBranchId],
    ['/super-admin/companies', lhrBranchId],
  ] as const)(
    'redirects to the correct company list after confirmed registration (%s)',
    async (companiesPath, selectedBranch) => {
      const user = userEvent.setup();
      render(
        <StaffRegisterCompanyForm
          branches={selectedBranch === khiBranchId ? branches.slice(0, 1) : branches}
          industries={industries}
          companiesPath={companiesPath}
        />,
      );

      const selects = screen.getAllByRole('combobox');
      const branchOffset = selectedBranch === lhrBranchId ? 1 : 0;
      if (branchOffset) await user.selectOptions(selects[0]!, selectedBranch);
      await user.type(screen.getByPlaceholderText('Registered company name'), 'Example Company');
      await user.selectOptions(selects[branchOffset]!, 'PRIVATE_LIMITED');
      await user.type(screen.getByPlaceholderText('e.g. 1234567-8'), '1234567-8');
      await user.selectOptions(selects[branchOffset + 1]!, 'RETAIL');
      await user.selectOptions(selects[branchOffset + 2]!, '1_10');
      await user.type(screen.getByPlaceholderText('Contact person'), 'Aisha Khan');
      await user.type(screen.getByLabelText('Authorised contact phone'), '03001234567');

      await user.click(screen.getByRole('button', { name: 'Register company' }));

      await waitFor(() => {
        expect(apiFetchMock).toHaveBeenCalledWith(
          '/api/v1/companies',
          expect.objectContaining({
            method: 'POST',
            idempotencyKey: expect.any(String),
            body: expect.objectContaining({
              branchId: selectedBranch,
              contacts: {
                items: [expect.objectContaining({ phone: '+923001234567' })],
              },
            }),
          }),
        );
        expect(successMock).toHaveBeenCalledWith('Company registered and verified');
        expect(pushMock).toHaveBeenCalledWith(companiesPath);
      });
    },
    15_000,
  );

  it('does not redirect or show success when company creation fails', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockRejectedValueOnce(new Error('database unavailable'));
    render(
      <StaffRegisterCompanyForm
        branches={branches.slice(0, 1)}
        industries={industries}
        companiesPath="/branch-admin/companies"
      />,
    );

    const selects = screen.getAllByRole('combobox');
    await user.type(screen.getByPlaceholderText('Registered company name'), 'Example Company');
    await user.selectOptions(selects[0]!, 'PRIVATE_LIMITED');
    await user.type(screen.getByPlaceholderText('e.g. 1234567-8'), '1234567-8');
    await user.selectOptions(selects[1]!, 'RETAIL');
    await user.selectOptions(selects[2]!, '1_10');
    await user.type(screen.getByPlaceholderText('Contact person'), 'Aisha Khan');
    await user.type(screen.getByLabelText('Authorised contact phone'), '03001234567');
    const submit = screen.getByRole('button', { name: 'Register company' });
    await user.click(submit);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(successMock).not.toHaveBeenCalled();

    const firstKey = apiFetchMock.mock.calls[0]![1].idempotencyKey;
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(apiFetchMock.mock.calls[1]![1].idempotencyKey).toBe(firstKey);

    await waitFor(() => expect(submit).toBeEnabled());
    const ntn = screen.getByPlaceholderText('e.g. 1234567-8');
    await user.clear(ntn);
    await user.type(ntn, '2234567-8');
    await user.click(submit);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3));
    expect(apiFetchMock.mock.calls[2]![1].idempotencyKey).not.toBe(firstKey);
  });
});
