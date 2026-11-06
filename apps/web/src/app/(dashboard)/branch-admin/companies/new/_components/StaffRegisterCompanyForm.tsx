'use client';

import {
  LEGAL_STRUCTURES,
  LEGAL_STRUCTURE_LABELS,
  COMPANY_SIZE_BANDS,
  COMPANY_SIZE_LABELS,
  staffRegisterCompanySchema,
} from '@jobbank/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button, Input, Select, Textarea } from '@/components/atoms';
import { FormField, PhoneInput, toast } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';

interface Props {
  branches: { id: string; name: string }[];
  industries: { code: string; label: string }[];
  companiesPath: '/branch-admin/companies' | '/super-admin/companies';
}

const STRUCTURE_OPTIONS = LEGAL_STRUCTURES.map((v) => ({
  value: v,
  label: LEGAL_STRUCTURE_LABELS[v],
}));
const SIZE_OPTIONS = COMPANY_SIZE_BANDS.map((v) => ({ value: v, label: COMPANY_SIZE_LABELS[v] }));

export function StaffRegisterCompanyForm({ branches, industries, companiesPath }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : '');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [legalStructure, setLegalStructure] = useState('');
  const [ntn, setNtn] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [industryCode, setIndustryCode] = useState('');
  const [sizeBand, setSizeBand] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactDesignation, setContactDesignation] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const industryOptions = industries.map((i) => ({ value: i.code, label: i.label }));
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  function handleSubmit() {
    startTransition(async () => {
      setError(null);
      const payload = {
        branchId,
        legalName: legalName.trim(),
        tradeName: tradeName.trim() || null,
        legalStructure,
        ntn: ntn.trim(),
        registrationNo: registrationNo.trim() || null,
        industryCode,
        sizeBand,
        website: website.trim() || null,
        description: description.trim() || null,
        contacts: {
          items: [
            {
              name: contactName.trim(),
              designation: contactDesignation.trim() || null,
              phone: contactPhone.trim(),
              email: contactEmail.trim() || null,
              isPrimary: true,
            },
          ],
        },
      };
      const parsed = staffRegisterCompanySchema.safeParse(payload);
      if (!parsed.success) {
        setError(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`)
            .join('; '),
        );
        return;
      }
      try {
        const fingerprint = JSON.stringify(parsed.data);
        if (idempotency.current?.fingerprint !== fingerprint) {
          idempotency.current = { fingerprint, key: crypto.randomUUID() };
        }
        await apiFetch('/api/v1/companies', {
          method: 'POST',
          body: parsed.data,
          idempotencyKey: idempotency.current.key,
        });
        toast.success('Company registered and verified');
        router.push(companiesPath);
      } catch (e) {
        if (e instanceof ApiClientError && e.issues.length > 0) {
          setError(e.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
        } else {
          setError(e instanceof ApiClientError ? e.message : 'Something went wrong');
        }
      }
    });
  }

  return (
    <div className="border-border bg-surface grid max-w-2xl gap-6 rounded-xl border p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {branches.length > 1 && (
          <FormField label="Branch" required className="sm:col-span-2">
            <Select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder="Select branch"
              options={branchOptions}
            />
          </FormField>
        )}
        <FormField label="Legal name" required className="sm:col-span-2">
          <Input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Registered company name"
          />
        </FormField>
        <FormField label="Trading name">
          <Input
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
            placeholder="If different from legal name"
          />
        </FormField>
        <FormField label="Legal structure" required>
          <Select
            value={legalStructure}
            onChange={(e) => setLegalStructure(e.target.value)}
            placeholder="Choose type"
            options={STRUCTURE_OPTIONS}
          />
        </FormField>
        <FormField label="NTN" required>
          <Input
            value={ntn}
            onChange={(e) => setNtn(e.target.value)}
            placeholder="e.g. 1234567-8"
          />
        </FormField>
        <FormField label="Registration No.">
          <Input
            value={registrationNo}
            onChange={(e) => setRegistrationNo(e.target.value)}
            placeholder="Optional"
          />
        </FormField>
        <FormField label="Industry" required>
          <Select
            value={industryCode}
            onChange={(e) => setIndustryCode(e.target.value)}
            placeholder="Select industry"
            options={industryOptions}
          />
        </FormField>
        <FormField label="Company size" required>
          <Select
            value={sizeBand}
            onChange={(e) => setSizeBand(e.target.value)}
            placeholder="Select size"
            options={SIZE_OPTIONS}
          />
        </FormField>
        <FormField label="Website" className="sm:col-span-2">
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
          />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the company (optional)"
            rows={3}
          />
        </FormField>
        <div className="border-border grid gap-4 rounded-lg border p-4 sm:col-span-2">
          <div>
            <h2 className="text-fg font-medium">Authorised contact</h2>
            <p className="text-fg-muted mt-1 text-sm">
              The person who provided or confirmed these company details.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Full name" required>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value.replace(/[^\p{L}\s.'-]/gu, ''))}
                placeholder="Contact person"
                maxLength={120}
              />
            </FormField>
            <FormField label="Designation">
              <Input
                value={contactDesignation}
                onChange={(e) =>
                  setContactDesignation(e.target.value.replace(/[^\p{L}\s.'-]/gu, ''))
                }
                placeholder="e.g. HR Manager"
                maxLength={120}
              />
            </FormField>
            <FormField label="Phone" required>
              <PhoneInput
                aria-label="Authorised contact phone"
                value={contactPhone}
                onChange={(change) => setContactPhone(change.e164 ?? change.national)}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Optional"
                maxLength={254}
              />
            </FormField>
          </div>
        </div>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          loading={pending}
          disabled={
            !branchId ||
            !legalName ||
            !legalStructure ||
            !ntn ||
            !industryCode ||
            !sizeBand ||
            !contactName ||
            !contactPhone
          }
        >
          Register company
        </Button>
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
