import { useCallback, useMemo, useRef, useState } from 'react';
import {
  CloudUpload, FileUp, Loader2, Sparkles, Upload, X, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { OKIRU_HUB_SECTORS, sectorDisplayLabel } from '@/lib/okiruHubSectors';

const COMPANY_SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised'] as const;

export interface CertificateFormValues {
  supplierName: string;
  vatNumber: string;
  sectorCode: string;
  location: string;
  businessUnit: string;
  companySize: string;
  bbbeeLevel: string;
  empoweringSupplier: '' | 'yes' | 'no';
  expiryDate: string;
  blackOwnership: string;
  blackFemaleOwnership: string;
  flowThroughBlackOwnership: string;
  blackDesignatedGroupOwnership: string;
  firstProcurementDate: string;
  sizeAtFirstProcurement: string;
  sdRecipient: '' | 'yes' | 'no';
  threeYearContract: '' | 'yes' | 'no';
  annualSpend: string;
}

export const EMPTY_CERTIFICATE_FORM: CertificateFormValues = {
  supplierName: '',
  vatNumber: '',
  sectorCode: '',
  location: '',
  businessUnit: '',
  companySize: '',
  bbbeeLevel: '',
  empoweringSupplier: '',
  expiryDate: '',
  blackOwnership: '',
  blackFemaleOwnership: '',
  flowThroughBlackOwnership: '',
  blackDesignatedGroupOwnership: '',
  firstProcurementDate: '',
  sizeAtFirstProcurement: '',
  sdRecipient: '',
  threeYearContract: '',
  annualSpend: '',
};

type FormErrors = Partial<Record<keyof CertificateFormValues, string>>;

function boolToSelect(v: boolean | null | undefined): '' | 'yes' | 'no' {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return '';
}

function pctToInput(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

export interface CertificateUploadFormProps {
  uploading: boolean;
  onClose: () => void;
  onSubmit: (file: File, values: CertificateFormValues) => Promise<void>;
}

export function CertificateUploadForm({ uploading, onClose, onSubmit }: CertificateUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [sectorUnsure, setSectorUnsure] = useState(false);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [form, setForm] = useState<CertificateFormValues>(EMPTY_CERTIFICATE_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  const setField = useCallback(<K extends keyof CertificateFormValues>(key: K, value: CertificateFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    if (key === 'sectorCode' && value) setSectorUnsure(false);
  }, []);

  const runMaiaExtraction = useCallback(async (file: File) => {
    setExtracting(true);
    setSectorUnsure(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/certificates/extract-preview', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Extraction failed');

      const data = json.data ?? json;
      setForm((prev) => ({
        ...prev,
        supplierName: data.supplierName || prev.supplierName,
        vatNumber: data.vatNumber || prev.vatNumber,
        companySize: data.companySize || prev.companySize,
        bbbeeLevel: data.bbbeeLevel != null ? String(data.bbbeeLevel) : prev.bbbeeLevel,
        blackOwnership: pctToInput(data.blackOwnership) || prev.blackOwnership,
        blackFemaleOwnership: pctToInput(data.blackWomenOwnership) || prev.blackFemaleOwnership,
        expiryDate: data.expiryDate || prev.expiryDate,
        sectorCode: data.sectorDetected && data.sectorCode ? data.sectorCode : prev.sectorCode,
      }));
      if (!data.sectorDetected) {
        setSectorUnsure(true);
      }
    } catch {
      setSectorUnsure(true);
    } finally {
      setExtracting(false);
    }
  }, []);

  const handleFileSelected = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const f = arr[0];
    if (f.size > 50 * 1024 * 1024) return;
    setUploadFile(f);
    if (!form.supplierName) {
      const guess = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').trim();
      setField('supplierName', guess.slice(0, 120));
    }
    void runMaiaExtraction(f);
  }, [form.supplierName, runMaiaExtraction, setField]);

  const validate = useCallback((): FormErrors => {
    const next: FormErrors = {};
    if (!uploadFile) next.supplierName = 'Upload a certificate file first';
    if (!form.supplierName.trim()) next.supplierName = 'Supplier name is required';
    if (!form.sectorCode) next.sectorCode = 'Sector is required';
    return next;
  }, [form.sectorCode, form.supplierName, uploadFile]);

  const validationErrors = useMemo(() => validate(), [validate]);
  const isFormValid = Object.keys(validationErrors).length === 0;

  const goToReview = useCallback(() => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setStep('review');
  }, [validate]);

  const handleSubmit = useCallback(async () => {
    if (!uploadFile) return;
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit(uploadFile, form);
  }, [form, onSubmit, uploadFile, validate]);

  const resetAndClose = useCallback(() => {
    if (uploading) return;
    setUploadFile(null);
    setForm(EMPTY_CERTIFICATE_FORM);
    setErrors({});
    setSectorUnsure(false);
    setStep('form');
    setDragOver(false);
    onClose();
  }, [onClose, uploading]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-2xl mx-4 rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-[15px] font-semibold text-white">Upload certificate</h2>
            <p className="text-[11px] text-[#636366] mt-0.5">
              {step === 'form' ? 'Upload with MAIA, complete details, then review' : 'Review before saving'}
            </p>
          </div>
          <button onClick={resetAndClose} disabled={uploading} className="text-[#636366] hover:text-white transition-colors disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {step === 'form' ? (
            <>
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-[#a5b4fc]" />
                  <h3 className="text-[12px] font-medium text-white uppercase tracking-wide">Upload with MAIA</h3>
                </div>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFileSelected(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                    dragOver ? 'border-[#6366f1] bg-[#6366f1]/10' : 'border-[#2c2c2e] hover:border-[#48484a] hover:bg-white/[0.02]'
                  }`}
                >
                  {extracting ? (
                    <div className="flex items-center justify-center gap-2 text-[13px] text-[#a5b4fc]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      MAIA is reading your certificate…
                    </div>
                  ) : uploadFile ? (
                    <div className="flex items-center justify-center gap-2 text-[13px] text-white">
                      <FileUp className="h-4 w-4 text-[#a5b4fc]" />
                      <span className="truncate max-w-[320px]">{uploadFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <CloudUpload className={`h-7 w-7 mx-auto mb-2 ${dragOver ? 'text-[#6366f1]' : 'text-[#48484a]'}`} />
                      <p className="text-[13px] text-[#e5e5ea]">Drag & drop or click to upload</p>
                      <p className="text-[11px] text-[#48484a] mt-1">PDF, PNG, JPG · up to 50MB</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx"
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleFileSelected(e.target.files); e.target.value = ''; }}
                  />
                </div>
              </section>

              <FormSection title="Supplier Information">
                <Field label="Supplier Name" required error={errors.supplierName}>
                  <input className="ok-cert-input" value={form.supplierName} onChange={(e) => setField('supplierName', e.target.value)} placeholder="Registered company name" />
                </Field>
                <Field label="VAT Number" error={errors.vatNumber}>
                  <input className="ok-cert-input" value={form.vatNumber} onChange={(e) => setField('vatNumber', e.target.value)} placeholder="e.g. 4123456789" />
                </Field>
                <Field label="Sector" required error={errors.sectorCode}>
                  <select className="ok-cert-input" value={form.sectorCode} onChange={(e) => setField('sectorCode', e.target.value)}>
                    <option value="">Select sector…</option>
                    {OKIRU_HUB_SECTORS.map((s) => (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ))}
                  </select>
                  {sectorUnsure && !form.sectorCode && (
                    <p className="text-[11px] text-[#f59e0b] mt-1.5">
                      Sector could not be confidently detected. Please select it manually.
                    </p>
                  )}
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Location" error={errors.location}>
                    <input className="ok-cert-input" value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="City or province" />
                  </Field>
                  <Field label="Business Unit" error={errors.businessUnit}>
                    <input className="ok-cert-input" value={form.businessUnit} onChange={(e) => setField('businessUnit', e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="B-BBEE Certificate Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Current Company Size" error={errors.companySize}>
                    <select className="ok-cert-input" value={form.companySize} onChange={(e) => setField('companySize', e.target.value)}>
                      <option value="">Select…</option>
                      {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="B-BBEE Level" error={errors.bbbeeLevel}>
                    <select className="ok-cert-input" value={form.bbbeeLevel} onChange={(e) => setField('bbbeeLevel', e.target.value)}>
                      <option value="">Select…</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={String(n)}>Level {n}</option>)}
                    </select>
                  </Field>
                  <Field label="Empowering Supplier" error={errors.empoweringSupplier}>
                    <select className="ok-cert-input" value={form.empoweringSupplier} onChange={(e) => setField('empoweringSupplier', e.target.value as '' | 'yes' | 'no')}>
                      <option value="">Not specified</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  <Field label="Certificate Expiry Date" error={errors.expiryDate}>
                    <input type="date" className="ok-cert-input" value={form.expiryDate} onChange={(e) => setField('expiryDate', e.target.value)} />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Ownership Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PercentField label="Current Black Ownership %" value={form.blackOwnership} onChange={(v) => setField('blackOwnership', v)} error={errors.blackOwnership} />
                  <PercentField label="Black Female Ownership %" value={form.blackFemaleOwnership} onChange={(v) => setField('blackFemaleOwnership', v)} error={errors.blackFemaleOwnership} />
                  <PercentField label="Flow-through Black Ownership %" value={form.flowThroughBlackOwnership} onChange={(v) => setField('flowThroughBlackOwnership', v)} error={errors.flowThroughBlackOwnership} />
                  <PercentField label="Black Designated Group Ownership %" value={form.blackDesignatedGroupOwnership} onChange={(v) => setField('blackDesignatedGroupOwnership', v)} error={errors.blackDesignatedGroupOwnership} />
                </div>
              </FormSection>

              <FormSection title="Procurement Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Date of First Procurement" error={errors.firstProcurementDate}>
                    <input type="date" className="ok-cert-input" value={form.firstProcurementDate} onChange={(e) => setField('firstProcurementDate', e.target.value)} />
                  </Field>
                  <Field label="Size at First Procurement" error={errors.sizeAtFirstProcurement}>
                    <select className="ok-cert-input" value={form.sizeAtFirstProcurement} onChange={(e) => setField('sizeAtFirstProcurement', e.target.value)}>
                      <option value="">Select…</option>
                      {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="SD Recipient" error={errors.sdRecipient}>
                    <select className="ok-cert-input" value={form.sdRecipient} onChange={(e) => setField('sdRecipient', e.target.value as '' | 'yes' | 'no')}>
                      <option value="">Not specified</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  <Field label="3-Year Contract in Place" error={errors.threeYearContract}>
                    <select className="ok-cert-input" value={form.threeYearContract} onChange={(e) => setField('threeYearContract', e.target.value as '' | 'yes' | 'no')}>
                      <option value="">Not specified</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  <Field label="Annual Spend (R)" error={errors.annualSpend}>
                    <input type="number" min={0} className="ok-cert-input" value={form.annualSpend} onChange={(e) => setField('annualSpend', e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
              </FormSection>
            </>
          ) : (
            <ReviewPanel file={uploadFile} form={form} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {step === 'review' ? (
            <button
              onClick={() => setStep('form')}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to edit
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={resetAndClose} disabled={uploading} className="px-4 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50">
              Cancel
            </button>
            {step === 'form' ? (
              <button
                onClick={goToReview}
                disabled={!isFormValid || extracting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors disabled:opacity-50"
              >
                Review
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={uploading || !isFormValid}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Save certificate
              </button>
            )}
          </div>
        </div>

        <style>{`
          .ok-cert-input {
            width: 100%;
            background: #0d0d10;
            border: 1px solid #2c2c2e;
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 13px;
            color: #fff;
            outline: none;
            transition: border-color 0.15s;
          }
          .ok-cert-input:focus { border-color: #6366f1; }
          .ok-cert-input.ok-cert-input-error { border-color: #ef4444; }
          .ok-cert-input::placeholder { color: #48484a; }
        `}</style>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 pb-5 border-b border-[#2c2c2e]/80 last:border-b-0 last:pb-0">
      <h3 className="text-[12px] font-medium text-[#a5b4fc] uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label, required, error, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5 tracking-wide">
        {label}{required && <span className="text-[#f87171] ml-0.5">*</span>}
      </span>
      {children}
      {error && <p className="text-[11px] text-[#ef4444] mt-1">{error}</p>}
    </label>
  );
}

function PercentField({
  label, value, onChange, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      <input type="number" min={0} max={100} step={0.1} className="ok-cert-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0–100" />
    </Field>
  );
}

function yesNoLabel(v: '' | 'yes' | 'no'): string {
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return '—';
}

function ReviewPanel({ file, form }: { file: File | null; form: CertificateFormValues }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'File', value: file?.name ?? '—' },
    { label: 'Supplier Name', value: form.supplierName || '—' },
    { label: 'VAT Number', value: form.vatNumber || '—' },
    { label: 'Sector', value: sectorDisplayLabel(form.sectorCode) },
    { label: 'Location', value: form.location || '—' },
    { label: 'Business Unit', value: form.businessUnit || '—' },
    { label: 'Current Company Size', value: form.companySize || '—' },
    { label: 'B-BBEE Level', value: form.bbbeeLevel ? `Level ${form.bbbeeLevel}` : '—' },
    { label: 'Empowering Supplier', value: yesNoLabel(form.empoweringSupplier) },
    { label: 'Certificate Expiry Date', value: form.expiryDate || '—' },
    { label: 'Current Black Ownership %', value: form.blackOwnership ? `${form.blackOwnership}%` : '—' },
    { label: 'Black Female Ownership %', value: form.blackFemaleOwnership ? `${form.blackFemaleOwnership}%` : '—' },
    { label: 'Flow-through Black Ownership %', value: form.flowThroughBlackOwnership ? `${form.flowThroughBlackOwnership}%` : '—' },
    { label: 'Black Designated Group Ownership %', value: form.blackDesignatedGroupOwnership ? `${form.blackDesignatedGroupOwnership}%` : '—' },
    { label: 'Date of First Procurement', value: form.firstProcurementDate || '—' },
    { label: 'Size at First Procurement', value: form.sizeAtFirstProcurement || '—' },
    { label: 'SD Recipient', value: yesNoLabel(form.sdRecipient) },
    { label: '3-Year Contract in Place', value: yesNoLabel(form.threeYearContract) },
    { label: 'Annual Spend', value: form.annualSpend ? `R ${Number(form.annualSpend).toLocaleString('en-ZA')}` : '—' },
  ];

  return (
    <div className="rounded-xl border border-[#2c2c2e] bg-[#0d0d10] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2c2c2e] text-[12px] text-[#8e8e93] uppercase tracking-wide">
        Review before saving
      </div>
      <dl className="divide-y divide-[#2c2c2e]/80">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_1.2fr] gap-3 px-4 py-2.5 text-[13px]">
            <dt className="text-[#636366]">{row.label}</dt>
            <dd className="text-white text-right break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Build multipart body for POST /api/certificates/upload */
export function certificateFormToFormData(file: File, values: CertificateFormValues): FormData {
  const fd = new FormData();
  fd.append('files', file);
  fd.append('companyName', values.supplierName.trim());
  if (values.vatNumber.trim()) fd.append('vatNumber', values.vatNumber.trim());
  fd.append('sectorCode', values.sectorCode);
  if (values.location.trim()) fd.append('location', values.location.trim());
  if (values.businessUnit.trim()) fd.append('businessUnit', values.businessUnit.trim());
  if (values.companySize) fd.append('companySize', values.companySize);
  if (values.bbbeeLevel) fd.append('bbbeeLevel', values.bbbeeLevel);
  if (values.empoweringSupplier) fd.append('empoweringSupplier', values.empoweringSupplier);
  if (values.expiryDate) fd.append('expiryDate', values.expiryDate);
  if (values.blackOwnership) fd.append('blackOwnership', values.blackOwnership);
  if (values.blackFemaleOwnership) fd.append('blackWomenOwnership', values.blackFemaleOwnership);
  if (values.flowThroughBlackOwnership) fd.append('flowThroughBlackOwnership', values.flowThroughBlackOwnership);
  if (values.blackDesignatedGroupOwnership) fd.append('blackDesignatedGroupOwnership', values.blackDesignatedGroupOwnership);
  if (values.firstProcurementDate) fd.append('firstProcurementDate', values.firstProcurementDate);
  if (values.sizeAtFirstProcurement) fd.append('sizeAtFirstProcurement', values.sizeAtFirstProcurement);
  if (values.sdRecipient) fd.append('sdRecipient', values.sdRecipient);
  if (values.threeYearContract) fd.append('threeYearContract', values.threeYearContract);
  if (values.annualSpend) fd.append('annualSpend', values.annualSpend);
  return fd;
}

/** Map API detail record into editable form values (legacy records may lack sector). */
export function certificateDetailToFormValues(data: Record<string, unknown>): CertificateFormValues {
  return {
    supplierName: String(data.companyName ?? ''),
    vatNumber: String(data.vatNumber ?? ''),
    sectorCode: String(data.sectorCode ?? ''),
    location: String(data.location ?? ''),
    businessUnit: String(data.businessUnit ?? ''),
    companySize: String(data.companySize ?? ''),
    bbbeeLevel: data.bbbeeLevel != null ? String(data.bbbeeLevel) : '',
    empoweringSupplier: boolToSelect(data.empoweringSupplier as boolean | null),
    expiryDate: data.expiryDate ? String(data.expiryDate).slice(0, 10) : '',
    blackOwnership: pctToInput(data.blackOwnership as number | null),
    blackFemaleOwnership: pctToInput(data.blackWomenOwnership as number | null),
    flowThroughBlackOwnership: pctToInput(data.flowThroughBlackOwnership as number | null),
    blackDesignatedGroupOwnership: pctToInput(data.blackDesignatedGroupOwnership as number | null),
    firstProcurementDate: data.firstProcurementDate ? String(data.firstProcurementDate).slice(0, 10) : '',
    sizeAtFirstProcurement: String(data.sizeAtFirstProcurement ?? ''),
    sdRecipient: boolToSelect(data.sdRecipient as boolean | null),
    threeYearContract: boolToSelect(data.threeYearContract as boolean | null),
    annualSpend: data.annualSpend != null ? String(data.annualSpend) : '',
  };
}

/** JSON body for PATCH /api/certificates/:id */
export function certificateFormToPatchBody(values: CertificateFormValues): Record<string, unknown> {
  return {
    supplierName: values.supplierName.trim(),
    vatNumber: values.vatNumber.trim() || null,
    sectorCode: values.sectorCode || null,
    location: values.location.trim() || null,
    businessUnit: values.businessUnit.trim() || null,
    companySize: values.companySize || null,
    bbbeeLevel: values.bbbeeLevel ? Number(values.bbbeeLevel) : null,
    empoweringSupplier: values.empoweringSupplier === 'yes' ? true : values.empoweringSupplier === 'no' ? false : null,
    expiryDate: values.expiryDate || null,
    blackOwnership: values.blackOwnership ? Number(values.blackOwnership) : null,
    blackWomenOwnership: values.blackFemaleOwnership ? Number(values.blackFemaleOwnership) : null,
    flowThroughBlackOwnership: values.flowThroughBlackOwnership ? Number(values.flowThroughBlackOwnership) : null,
    blackDesignatedGroupOwnership: values.blackDesignatedGroupOwnership ? Number(values.blackDesignatedGroupOwnership) : null,
    firstProcurementDate: values.firstProcurementDate || null,
    sizeAtFirstProcurement: values.sizeAtFirstProcurement || null,
    sdRecipient: values.sdRecipient === 'yes' ? true : values.sdRecipient === 'no' ? false : null,
    threeYearContract: values.threeYearContract === 'yes' ? true : values.threeYearContract === 'no' ? false : null,
    annualSpend: values.annualSpend ? Number(values.annualSpend) : null,
  };
}
