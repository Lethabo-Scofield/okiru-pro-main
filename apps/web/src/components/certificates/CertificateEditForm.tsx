import { useCallback, useMemo, useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import { OKIRU_HUB_SECTORS, sectorDisplayLabel } from '@/lib/okiruHubSectors';
import {
  certificateDetailToFormValues,
  certificateFormToPatchBody,
  EMPTY_CERTIFICATE_FORM,
  type CertificateFormValues,
} from '@/components/certificates/CertificateUploadForm';

const COMPANY_SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised'] as const;
const BBBEE_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

interface CertificateEditFormProps {
  initial: Record<string, unknown>;
  saving: boolean;
  onClose: () => void;
  onSave: (values: CertificateFormValues) => Promise<void>;
}

export function CertificateEditForm({ initial, saving, onClose, onSave }: CertificateEditFormProps) {
  const [form, setForm] = useState<CertificateFormValues>(() => certificateDetailToFormValues(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof CertificateFormValues, string>>>({});

  const setField = <K extends keyof CertificateFormValues>(key: K, value: CertificateFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = useCallback(() => {
    const next: Partial<Record<keyof CertificateFormValues, string>> = {};
    if (!form.supplierName.trim()) next.supplierName = 'Supplier name is required';
    if (!form.sectorCode) next.sectorCode = 'Sector is required';
    return next;
  }, [form.supplierName, form.sectorCode]);

  const validationErrors = useMemo(() => validate(), [validate]);
  const isFormValid = Object.keys(validationErrors).length === 0;

  const handleSave = useCallback(async () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSave(form);
  }, [form, onSave, validate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-2xl max-h-[92vh] rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c2c2e]">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-[#a5b4fc]" />
            <h2 className="text-[15px] font-semibold text-white">Edit certificate</h2>
          </div>
          <button onClick={onClose} disabled={saving} className="text-[#636366] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-5">
          <Section title="Supplier Information">
            <InputField label="Supplier Name" required value={form.supplierName} error={errors.supplierName} onChange={(v) => setField('supplierName', v)} />
            <InputField label="VAT Number" value={form.vatNumber} onChange={(v) => setField('vatNumber', v)} />
            <label className="block">
              <span className="block text-[11px] text-[#8e8e93] mb-1.5">Sector <span className="text-[#f87171]">*</span></span>
              <select className="ok-cert-input" value={form.sectorCode} onChange={(e) => setField('sectorCode', e.target.value)}>
                <option value="">Select sector…</option>
                {OKIRU_HUB_SECTORS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              {errors.sectorCode && <p className="text-[11px] text-[#ef4444] mt-1">{errors.sectorCode}</p>}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField label="Location" value={form.location} onChange={(v) => setField('location', v)} />
              <InputField label="Business Unit" value={form.businessUnit} onChange={(v) => setField('businessUnit', v)} />
            </div>
          </Section>
          <Section title="B-BBEE Certificate Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Current Company Size" value={form.companySize} options={COMPANY_SIZES} onChange={(v) => setField('companySize', v)} />
              <SelectField label="B-BBEE Level" value={form.bbbeeLevel} options={BBBEE_LEVELS} onChange={(v) => setField('bbbeeLevel', v)} />
              <YesNoField label="Empowering Supplier" value={form.empoweringSupplier} onChange={(v) => setField('empoweringSupplier', v)} />
              <DateField label="Certificate Expiry Date" value={form.expiryDate} onChange={(v) => setField('expiryDate', v)} />
            </div>
          </Section>
          <Section title="Ownership Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField label="Current Black Ownership %" value={form.blackOwnership} min={0} max={100} step={0.1} onChange={(v) => setField('blackOwnership', v)} />
              <NumberField label="Black Female Ownership %" value={form.blackFemaleOwnership} min={0} max={100} step={0.1} onChange={(v) => setField('blackFemaleOwnership', v)} />
              <NumberField label="Flow-through Black Ownership %" value={form.flowThroughBlackOwnership} min={0} max={100} step={0.1} onChange={(v) => setField('flowThroughBlackOwnership', v)} />
              <NumberField label="Black Designated Group Ownership %" value={form.blackDesignatedGroupOwnership} min={0} max={100} step={0.1} onChange={(v) => setField('blackDesignatedGroupOwnership', v)} />
            </div>
          </Section>
          <Section title="Procurement Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField label="Date of First Procurement" value={form.firstProcurementDate} onChange={(v) => setField('firstProcurementDate', v)} />
              <SelectField label="Size at First Procurement" value={form.sizeAtFirstProcurement} options={COMPANY_SIZES} onChange={(v) => setField('sizeAtFirstProcurement', v)} />
              <YesNoField label="SD Recipient" value={form.sdRecipient} onChange={(v) => setField('sdRecipient', v)} />
              <YesNoField label="3-Year Contract in Place" value={form.threeYearContract} onChange={(v) => setField('threeYearContract', v)} />
              <NumberField label="Annual Spend (R)" value={form.annualSpend} min={0} step={1} onChange={(v) => setField('annualSpend', v)} />
            </div>
          </Section>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#2c2c2e]">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving || !isFormValid} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save changes
          </button>
        </div>
        <style>{`.ok-cert-input{width:100%;background:#0d0d10;border:1px solid #2c2c2e;border-radius:8px;padding:8px 10px;font-size:13px;color:#fff;outline:none}.ok-cert-input:focus{border-color:#6366f1}`}</style>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[12px] font-medium text-[#a5b4fc] uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InputField({ label, required, value, error, onChange }: { label: string; required?: boolean; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5">{label}{required && <span className="text-[#f87171] ml-0.5">*</span>}</span>
      <input className="ok-cert-input" value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="text-[11px] text-[#ef4444] mt-1">{error}</p>}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5">{label}</span>
      <select className="ok-cert-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{label.includes('Level') ? `Level ${o}` : o}</option>)}
      </select>
    </label>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: '' | 'yes' | 'no'; onChange: (v: '' | 'yes' | 'no') => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5">{label}</span>
      <select className="ok-cert-input" value={value} onChange={(e) => onChange(e.target.value as '' | 'yes' | 'no')}>
        <option value="">Not specified</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5">{label}</span>
      <input type="date" className="ok-cert-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="ok-cert-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export { sectorDisplayLabel, EMPTY_CERTIFICATE_FORM };
