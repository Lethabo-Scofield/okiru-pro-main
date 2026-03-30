/**
 * Entity Field Input Components
 *
 * Type-specific input components for B-BBEE entity fields.
 * Each component handles validation, formatting, and error display.
 */

import { useState, useCallback } from 'react';
import { formatCurrency, formatPercentage, parseCurrency, parsePercentage } from './formatters';
import type { EntityField } from '@api/pipeline/extraction/entityManifest';

// ============================================================================
// Types
// ============================================================================

export interface FieldInputProps {
  field: EntityField;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// Validation
// ============================================================================

export function validateField(field: EntityField, value: unknown): ValidationResult {
  if (field.required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: `${field.name} is required` };
  }

  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }

  const { validation } = field;

  switch (field.fieldType) {
    case 'currency': {
      const num = typeof value === 'string' ? parseCurrency(value) : Number(value);
      if (isNaN(num)) return { valid: false, error: 'Invalid amount' };
      if (validation.min !== undefined && num < validation.min) {
        return { valid: false, error: `Minimum ${formatCurrency(validation.min)}` };
      }
      if (validation.max !== undefined && num > validation.max) {
        return { valid: false, error: `Maximum ${formatCurrency(validation.max)}` };
      }
      return { valid: true };
    }

    case 'percentage': {
      const num = typeof value === 'string' ? parsePercentage(value) : Number(value);
      if (isNaN(num)) return { valid: false, error: 'Invalid percentage' };
      if (validation.min !== undefined && num < validation.min) {
        return { valid: false, error: `Minimum ${formatPercentage(validation.min)}` };
      }
      if (validation.max !== undefined && num > validation.max) {
        return { valid: false, error: `Maximum ${formatPercentage(validation.max)}` };
      }
      return { valid: true };
    }

    case 'count': {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) return { valid: false, error: 'Whole number required' };
      if (validation.min !== undefined && num < validation.min) {
        return { valid: false, error: `Minimum ${validation.min}` };
      }
      if (validation.max !== undefined && num > validation.max) {
        return { valid: false, error: `Maximum ${validation.max}` };
      }
      return { valid: true };
    }

    case 'string': {
      const str = String(value).trim();
      if (validation.enum && !validation.enum.includes(str)) {
        return { valid: false, error: `Must be one of: ${validation.enum.join(', ')}` };
      }
      return { valid: true };
    }

    case 'date': {
      const date = new Date(String(value));
      if (isNaN(date.getTime())) return { valid: false, error: 'Invalid date' };
      return { valid: true };
    }

    case 'bee_level': {
      const level = Number(value);
      if (!Number.isInteger(level) || level < 0 || level > 8) {
        return { valid: false, error: 'B-BBEE Level must be 0-8' };
      }
      return { valid: true };
    }

    case 'boolean': {
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

// ============================================================================
// Currency Input
// ============================================================================

export function CurrencyInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const [displayValue, setDisplayValue] = useState(() => 
    value !== undefined && value !== null ? formatCurrency(Number(value), false) : ''
  );
  const [error, setError] = useState<string>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    
    const parsed = parseCurrency(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
      const validation = validateField(field, parsed);
      setError(validation.error);
    } else if (raw === '') {
      onChange(undefined);
      setError(undefined);
    }
  }, [field, onChange]);

  const handleBlur = useCallback(() => {
    if (value !== undefined && value !== null) {
      setDisplayValue(formatCurrency(Number(value), false));
    }
    onBlur?.();
  }, [value, onBlur]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366] text-sm">R</span>
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={field.ui?.placeholder || '0.00'}
          className={`
            w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
            ${sizeClasses[size]} pl-7
            text-white placeholder-[#636366]
            focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
          `}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {field.ui?.helpText && !error && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Percentage Input
// ============================================================================

export function PercentageInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const [displayValue, setDisplayValue] = useState(() => 
    value !== undefined && value !== null ? formatPercentage(Number(value), false) : ''
  );
  const [error, setError] = useState<string>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDisplayValue(raw);
    
    const parsed = parsePercentage(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
      const validation = validateField(field, parsed);
      setError(validation.error);
    } else if (raw === '') {
      onChange(undefined);
      setError(undefined);
    }
  }, [field, onChange]);

  const handleBlur = useCallback(() => {
    if (value !== undefined && value !== null) {
      setDisplayValue(formatPercentage(Number(value), false));
    }
    onBlur?.();
  }, [value, onBlur]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={field.ui?.placeholder || '0.00'}
          className={`
            w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
            ${sizeClasses[size]} pr-8
            text-white placeholder-[#636366]
            focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
          `}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#636366] text-sm">%</span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {field.ui?.helpText && !error && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Number/Count Input
// ============================================================================

export function CountInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const [error, setError] = useState<string>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(undefined);
      setError(undefined);
      return;
    }
    
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      onChange(parsed);
      const validation = validateField(field, parsed);
      setError(validation.error);
    }
  }, [field, onChange]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <input
        type="number"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={field.ui?.placeholder || '0'}
        min={field.validation.min}
        max={field.validation.max}
        className={`
          w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
          ${sizeClasses[size]}
          text-white placeholder-[#636366]
          focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
        `}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {field.ui?.helpText && !error && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Text Input
// ============================================================================

export function TextInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const [error, setError] = useState<string>();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val || undefined);
    const validation = validateField(field, val);
    setError(validation.error);
  }, [field, onChange]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={field.ui?.placeholder}
        className={`
          w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
          ${sizeClasses[size]}
          text-white placeholder-[#636366]
          focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
        `}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {field.ui?.helpText && !error && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Select Input (for enums)
// ============================================================================

export function SelectInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const options = field.validation.enum || [];
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onChange(val || undefined);
    onBlur?.();
  }, [onChange, onBlur]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={handleChange}
          disabled={disabled || options.length === 0}
          className={`
            w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
            ${sizeClasses[size]} pr-10
            text-white
            focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150
            appearance-none
          `}
        >
          <option value="">Select...</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {field.ui?.helpText && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Date Input
// ============================================================================

export function DateInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val || undefined);
  }, [onChange]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <input
        type="date"
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        className={`
          w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
          ${sizeClasses[size]}
          text-white placeholder-[#636366]
          focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
          [color-scheme:dark]
        `}
      />
      {field.ui?.helpText && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// B-BBEE Level Input
// ============================================================================

export function BeeLevelInput({ field, value, onChange, onBlur, disabled, size = 'md' }: FieldInputProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onChange(val ? parseInt(val, 10) : undefined);
    onBlur?.();
  }, [onChange, onBlur]);

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base'
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={handleChange}
          disabled={disabled}
          className={`
            w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg
            ${sizeClasses[size]} pr-10
            text-white
            focus:outline-none focus:border-[#636366] focus:ring-1 focus:ring-[#636366]
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150
            appearance-none
          `}
        >
          <option value="">Select level...</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
          <option value="5">Level 5</option>
          <option value="6">Level 6</option>
          <option value="7">Level 7</option>
          <option value="8">Level 8</option>
          <option value="0">Non-compliant</option>
        </select>
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#636366] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {field.ui?.helpText && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Toggle/Boolean Input
// ============================================================================

export function ToggleInput({ field, value, onChange, onBlur, disabled }: FieldInputProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
    onBlur?.();
  }, [onChange, onBlur]);

  return (
    <div className="space-y-1">
      <label className="inline-flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            type="checkbox"
            checked={value === true}
            onChange={handleChange}
            disabled={disabled}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2c2e] rounded-full peer peer-checked:bg-emerald-500 peer-disabled:opacity-50 transition-colors duration-200" />
          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-5" />
        </div>
        <span className="text-sm text-[#b0b0b8] group-hover:text-white transition-colors">
          {value === true ? 'Yes' : 'No'}
        </span>
      </label>
      {field.ui?.helpText && <p className="text-xs text-[#636366]">{field.ui.helpText}</p>}
    </div>
  );
}

// ============================================================================
// Smart Field Input (auto-detects type)
// ============================================================================

export function EntityFieldInput(props: FieldInputProps) {
  const { field } = props;

  // Use ui.inputType if specified, otherwise fall back to fieldType
  const inputType = field.ui?.inputType || field.fieldType;

  switch (inputType) {
    case 'currency':
      return <CurrencyInput {...props} />;
    case 'percentage':
      return <PercentageInput {...props} />;
    case 'number':
    case 'count':
      return <CountInput {...props} />;
    case 'select':
      return <SelectInput {...props} />;
    case 'date':
      return <DateInput {...props} />;
    case 'toggle':
      return <ToggleInput {...props} />;
    case 'text':
    default:
      return <TextInput {...props} />;
  }
}

// ============================================================================
// Formatter utilities
// ============================================================================

export function formatCurrency(value: number, withSymbol = true): string {
  if (isNaN(value)) return '';
  const formatted = value.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `R ${formatted}` : formatted;
}

export function formatPercentage(value: number, withSymbol = true): string {
  if (isNaN(value)) return '';
  const formatted = (value * 100).toFixed(2);
  return withSymbol ? `${formatted}%` : formatted;
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned);
}

export function parsePercentage(value: string): number {
  const cleaned = value.replace(/%/g, '');
  return parseFloat(cleaned) / 100;
}
