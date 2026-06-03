const MILESTONES = [
  { tier: "Pre-Recognised", year: "2025", req: "SBTi commitment letter" },
  { tier: "Recognised", year: "2028", req: "−50% Scope 1+2 from baseline" },
  { tier: "Leadership", year: "2035", req: "−90% S1+2 + 30% S3 + offsets" },
  { tier: "Net-Zero", year: "2050", req: "Net-zero S1+2+3" },
];

const LEVERS = [
  { lever: "EV Fleet", action: "20% EV by 2030", owner: "Fleet Mgr" },
  { lever: "Solar", action: "50% renewable by 2030", owner: "Ops" },
  { lever: "Eco-driving", action: "−10% L/100km", owner: "WSP" },
  { lever: "Waste", action: "≥75% diversion all depots", owner: "SHEQ" },
];

export default function EsgNetZero() {
  return (
    <div className="space-y-5" data-testid="esg-net-zero">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Net-Zero Roadmap</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">SBTi CNZS 2.0 milestones from NetZero_Roadmap sheet.</p>
      <div className="esg-glass p-5 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[var(--esg-text3)] text-left">
              <th className="pb-2">Tier</th>
              <th className="pb-2">Year</th>
              <th className="pb-2">Requirement</th>
            </tr>
          </thead>
          <tbody>
            {MILESTONES.map((m) => (
              <tr key={m.tier} className="border-t border-[var(--esg-glass-border)]">
                <td className="py-2 text-[var(--esg-text)]">{m.tier}</td>
                <td className="py-2">{m.year}</td>
                <td className="py-2 text-[var(--esg-text2)]">{m.req}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="esg-glass p-5">
        <h2 className="text-[11px] font-bold uppercase text-[var(--esg-text3)] mb-3">Key levers</h2>
        <ul className="space-y-2 text-[12px] text-[var(--esg-text2)]">
          {LEVERS.map((l) => (
            <li key={l.lever}>
              <span className="text-[var(--esg-acc-e)] font-medium">{l.lever}</span> — {l.action} ({l.owner})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
