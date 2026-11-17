'use client';

import React, { useState } from 'react';
import Button from './Button';

export interface FormFieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'date' | 'time';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: { label: string; value: string }[];
}

export default function DynamicForm({
  fields = [],
  onSubmit,
  submitLabel = 'حفظ',
  loading = false,
}: {
  fields: FormFieldDef[];
  onSubmit: (data: Record<string, string>) => void;
  submitLabel?: string;
  loading?: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.name] = f.defaultValue ?? '';
    });
    return initial;
  });

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <label className="block text-sm font-bold text-fg">
            {field.label}{' '}
            {field.required ? <span className="text-rose-500">*</span> : null}
          </label>

          {field.type === 'select' ? (
            <select
              value={formData[field.name] ?? ''}
              required={field.required}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
            >
              <option value="">{field.placeholder || 'اختر...'}</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              value={formData[field.name] ?? ''}
              required={field.required}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
            />
          ) : (
            <input
              type={field.type || 'text'}
              value={formData[field.name] ?? ''}
              required={field.required}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded-xl border border-line bg-surface p-2.5 text-sm text-fg focus:border-brand-600 focus:outline-none"
            />
          )}
        </div>
      ))}
      <div className="pt-2">
        <Button type="submit" className="w-full" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
