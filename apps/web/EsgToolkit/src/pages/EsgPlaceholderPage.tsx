interface EsgPlaceholderPageProps {
  title: string;
  description: string;
}

export function EsgPlaceholderPage({ title, description }: EsgPlaceholderPageProps) {
  return (
    <div className="esg-glass p-6 max-w-2xl" data-testid="esg-placeholder-page">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">{title}</h1>
      <p className="text-[13px] text-[var(--esg-text2)] mt-2 leading-relaxed">{description}</p>
    </div>
  );
}
