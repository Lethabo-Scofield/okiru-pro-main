export const meta = {
  name: 'bbbee-connection-specs',
  description: 'Per-sector toolkit↔code connection specs + adversarially-verified discrepancy ledger, grounded in verbatim Excel formula extracts',
  phases: [
    { title: 'Author', detail: 'one agent per sector: write connections.md from verbatim formulas + emit discrepancies vs live code' },
    { title: 'Verify', detail: 'adversarially re-check each claimed discrepancy against the extract and the code' },
  ],
}

const SECTORS = [
  { key: 'rcogp/generic', code: 'RCOGP', size: 'Generic', extract: 'RCOGP_Generic', cfg: 'RCOGP_GENERIC', cfgLine: 425, calc: 'rcogp-generic', toolkit: 'BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx' },
  { key: 'rcogp/qse',     code: 'RCOGP', size: 'QSE',     extract: 'RCOGP_QSE',     cfg: 'RCOGP_QSE',     cfgLine: 1093, calc: 'rcogp-qse',   toolkit: 'BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx' },
  { key: 'ict/generic',   code: 'ICT',   size: 'Generic', extract: 'ICT_Generic',   cfg: 'ICT_GENERIC',   cfgLine: 517,  calc: 'ict-generic', toolkit: 'BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx' },
  { key: 'ict/qse',       code: 'ICT',   size: 'QSE',     extract: 'ICT_QSE',       cfg: 'ICT_QSE',       cfgLine: 1181, calc: 'ict-qse',     toolkit: 'BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx' },
  { key: 'agri/generic',  code: 'AGRI',  size: 'Generic', extract: 'AGRI_Generic',  cfg: 'AGRI_GENERIC',  cfgLine: 990,  calc: 'agri-generic', toolkit: 'BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx' },
  { key: 'fsc/generic',   code: 'FSC',   size: 'Generic', extract: 'FSC_Generic',   cfg: 'FSC_GENERIC',   cfgLine: 629,  calc: 'fsc-generic', toolkit: 'BBBEE Toolkit (FSC) Template v1.0.xlsx' },
]

const DISC = {
  type: 'object',
  required: ['id', 'pillar', 'toolkit_evidence', 'code_location', 'delta', 'confidence'],
  properties: {
    id: { type: 'string', description: 'D-01, D-02, ...' },
    pillar: { type: 'string' },
    rule: { type: 'string', description: 'indicator label' },
    toolkit_evidence: { type: 'string', description: 'sheet!cell + the VERBATIM formula or non-zero cached value proving the toolkit truth. Must NOT be a blank-template zero.' },
    code_location: { type: 'string', description: 'file path : symbol/line' },
    code_value: { type: 'string' },
    delta: { type: 'string', description: 'what differs' },
    score_effect: { type: 'string', description: 'how a real entity\'s score is wrong because of this' },
    confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
  },
}

const AUTHOR_OUT = {
  type: 'object',
  required: ['sector_key', 'connections_path', 'summary', 'discrepancies'],
  properties: {
    sector_key: { type: 'string' },
    connections_path: { type: 'string' },
    grand_total_excel: { type: 'string', description: 'pillar total from the Summary Scorecard cell (cite cell)' },
    grand_total_code: { type: 'string' },
    dropdown_enums_documented: { type: 'integer' },
    registration_risks: { type: 'array', items: { type: 'string' }, description: 'concrete ways a real user input silently scores zero (enum mismatch, flag vs designation, unselected EAP, etc.)' },
    summary: { type: 'string' },
    discrepancies: { type: 'array', items: DISC },
  },
}

const VERDICT = {
  type: 'object',
  required: ['id', 'verdict', 'reason'],
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'rejected', 'uncertain'] },
    reason: { type: 'string', description: 'cite the exact cell/formula and code symbol you re-checked' },
    severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
    recommended_fix: { type: 'string', description: 'precise, e.g. file:symbol set X=Y; or "confirm with B-BBEE expert"' },
  },
}

const authorPrompt = (s) => `You are a B-BBEE technical analyst. Produce a VERBATIM, 1-to-1 "Toolkit Connection Spec" for **${s.code} ${s.size}** (toolkit: \`${s.toolkit}\`), then list where the LIVE code diverges from the toolkit.

This is the deliverable the client asked for: a markdown variant of the Excel where a developer can see every rule, its inputs, the ONLY viable input options, the verbatim formula, and exactly what makes a score change. Be precise enough that a later session could fix the scorer from your file alone.

## Read these (use Grep to pull only the sections you need — the extract .md is large)
1. Template to follow EXACTLY: \`docs/domain/sectors/connection-spec-template.md\`
2. Existing logic spec (resolved Q&A, targets): \`docs/domain/sectors/${s.key}/sls.md\` and \`docs/domain/sectors/TOOLKIT-RESOLVED.md\`
3. VERBATIM formula + dropdown extract: \`docs/toolkits/extracted_formulas/${s.extract}.md\`
   - Grep headings like \`^### \\\`Summary Scorecard\\\`\`, \`^### \\\`MC Scorecard\\\`\`, \`^### \\\`Ownership Scorecard\\\`\`, \`^### \\\`Skills Scorecard\\\`\`, \`^### \\\`Procurement Scorecard\\\`\`, \`^### \\\`ESD Scorecard\\\`\`, \`^### \\\`SED\`, and the \`^## Input options\` section. For FSC also \`EF\`, \`AFS\`, \`SED & CE\`.
4. Numeric source of truth (the live config): \`apps/api/pipeline/sectorConfig.ts\` — the \`export const ${s.cfg}\` block (around line ${s.cfgLine}).
5. The live calculators (the TS reimplementation of the Excel): \`apps/web/Toolkit/src/lib/calculators/{ownership,management,skills,procurement,esd-sed,yes,shared}.ts\` and the sector config \`apps/web/Toolkit/src/lib/sectors/${s.calc}.ts\`.

## Critical framing
The TS calculators are a REIMPLEMENTATION of the Excel logic, not a binding to the workbook. "1-to-1" therefore means: for each scored indicator, show the verbatim Excel formula (e.g. \`MC Scorecard!H21 = MIN(IF(J21="",G21/E21*F21,J21),F21)\`, actual% via \`COUNTIFS(tblMCData[Designation *],"Senior Manager",tblMCData[Black?],"Yes",tblMCData[End of Month],<period>)\`) AND the code that should compute the same number, then state whether they agree.

Beware blank-template artifacts: the toolkit ships with no data, so many cached values are 0. NEVER cite a 0 as a target/max — read the FORMULA and the label cells, the SLS, and the config to determine the true max points and targets. A pillar total is the SUM formula's cached value on the Summary/Scorecard total row (cite the cell).

## The "registration" problem (the client's main pain)
Document, per pillar, exactly what makes a score move and what makes it silently stay 0. Cross-reference the dropdown enums (the ONLY viable values, from the Input options section) against the code normalisers (\`normalizeDesignationForScoring\`, \`isBlackRace\`, \`normalizeRace\` in shared.ts; the \`*_MAP\` tables and select options). Flag every place where a toolkit dropdown value, a Yes/No flag column (e.g. \`Board?\`, \`Black?\`, \`Disabled?\`), or an unselected EAP year/province causes a zero. Put these in \`registration_risks\` and in the spec's §2/§3 "score_moves_when / score_stuck_at_zero_if".

## Output
1. WRITE the completed spec to \`docs/domain/sectors/${s.key}/connections.md\` following connection-spec-template.md (all sections; one rule block per scored indicator; the §6 discrepancy ledger; §2 input dictionary with verbatim dropdown enums).
2. Return the structured result: sector_key=\`${s.key}\`, connections_path, grand totals (with the cell you read), registration_risks, a 3-4 sentence summary, and the discrepancies array. Each discrepancy MUST cite real toolkit evidence (sheet!cell + formula/label) and a precise code_location. Mark confidence HIGH only when the Excel formula/label is unambiguous and clearly disagrees with the code. If the toolkit and code agree, do not invent a discrepancy.`

const verifyPrompt = (s, d) => `Adversarially verify ONE claimed discrepancy for ${s.code} ${s.size}. Default to "rejected" unless you can independently reproduce the evidence. Many prior "discrepancies" in this project were extractor artifacts (blank-template zeros) — your job is to catch those.

Claim ${d.id} — pillar: ${d.pillar} — rule: ${d.rule || '(n/a)'}
- Toolkit evidence claimed: ${d.toolkit_evidence}
- Code location claimed: ${d.code_location}  (value: ${d.code_value || '?'})
- Delta: ${d.delta}
- Claimed score effect: ${d.score_effect || '?'}

Steps:
1. Open \`docs/toolkits/extracted_formulas/${s.extract}.md\` (and \`.json\` if needed) and find the cited cell. Confirm the formula/label SAYS what the claim says — and that the cited number is NOT a blank-template 0 masquerading as a target/max. Read the actual SUM/MIN/COUNTIFS formula and the label cell.
2. Open the cited code (\`apps/api/pipeline/sectorConfig.ts\` ${s.cfg} block near line ${s.cfgLine}, or the calculator) and confirm the code value.
3. Cross-check against \`docs/domain/sectors/${s.key}/sls.md\` and \`TOOLKIT-RESOLVED.md\` — several apparent gaps are already explained there (YES base-points gates, combined Exco+Senior, Net-Value sub-min, etc.). If the SLS already resolves it, verdict=rejected.

Return: id=${d.id}, verdict (confirmed only if a real, reproducible code↔toolkit mismatch that changes a score), reason citing the exact cell+formula and code symbol, severity, and a precise recommended_fix.`

phase('Author')
log(`Authoring connection specs for ${SECTORS.length} sectors…`)

const results = await pipeline(
  SECTORS,
  (s) => agent(authorPrompt(s), { label: `author:${s.key}`, phase: 'Author', schema: AUTHOR_OUT }).then((out) => ({ s, out })),
  ({ s, out }) => {
    const discs = (out && out.discrepancies) || []
    if (!discs.length) return { sector: s.key, out, verified: [] }
    return parallel(
      discs.map((d) => () =>
        agent(verifyPrompt(s, d), { label: `verify:${s.key}:${d.id}`, phase: 'Verify', schema: VERDICT })
          .then((v) => ({ ...d, verdict: v }))
          .catch(() => ({ ...d, verdict: { id: d.id, verdict: 'uncertain', reason: 'verifier error' } }))
      )
    ).then((verified) => ({ sector: s.key, out, verified }))
  }
)

const clean = results.filter(Boolean)
const confirmed = []
for (const r of clean) {
  for (const v of r.verified || []) {
    if (v.verdict && v.verdict.verdict === 'confirmed') confirmed.push({ sector: r.sector, ...v })
  }
}
log(`Done. ${clean.length} sectors; ${confirmed.length} confirmed discrepancies.`)
return {
  sectors: clean.map((r) => ({
    sector: r.sector,
    connections_path: r.out && r.out.connections_path,
    grand_total_excel: r.out && r.out.grand_total_excel,
    grand_total_code: r.out && r.out.grand_total_code,
    summary: r.out && r.out.summary,
    registration_risks: (r.out && r.out.registration_risks) || [],
    discrepancy_count: (r.out && r.out.discrepancies && r.out.discrepancies.length) || 0,
  })),
  confirmed_discrepancies: confirmed,
}
