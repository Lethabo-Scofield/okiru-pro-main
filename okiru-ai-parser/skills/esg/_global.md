---
id: _global
version: 1
---
Rules for reading ANY South African ESG evidence document: municipal and
landlord utility accounts, fuel and bowser records, fleet registers, waste
contractor reports, Employment Equity reports, safety registers, training
records, policies, codes of conduct, audit reports, risk registers and the
client's own monthly data workbooks. Each skill's own traps come first; these
are always added after them and are never relaxed by a skill.

## Where values sit

- You report what the document STATES. You are not the assurance provider:
  do not decide whether a figure is in scope, which scope it belongs to, or
  whether it is plausible. Do not repair the document, and do not fill a gap
  from another document in the pack.
- Return ONE flat JSON object: the skill's field names as keys, row fields as
  an array of objects under the skill's rows field, and `exceptions` (a list of
  short notes). A value the document does not state is null.
- Scanned pages reach you as OCR text. Tables may arrive as pipe tables, as
  `label: value` lines, or as HTML. Read the CELL CONTENT; the markup around it
  is never a value. A table the text layer has flattened ("5 00 01 0 0 6") is
  not readable as digits run together: read it from the cells or page image,
  or leave it null and say so.
- A value usually sits in the cell to the RIGHT of its label, or in the cell
  BELOW a column heading. A site x month grid has sites (or measures) down the
  side and months across the top: the value belongs to the row's site AND the
  column's month, never to a total.
- Every quantity has a UNIT. Copy the figure as printed and copy the unit the
  document prints for it (in the unit field, or in exceptions when the skill
  has none). kWh, MWh, litres, kL, m3, kg and tonnes are different numbers for
  the same thing; the code converts, never you.
- Amounts: South African documents use spaces or commas as thousand separators
  ("1 234 567", "1,234,567.89"), sometimes a decimal comma ("1 234,56"), "R"
  prefixes, and BRACKETS for negatives or credits ("(1 250.00)"). Copy the
  figure with its sign as printed. Say whether a Rand figure includes VAT only
  when the document says so.
- Dates are day-first: "03/04/2025" is 3 April 2025. Copy dates as printed;
  code converts them. A spreadsheet may show a date as a serial number
  ("45838"); copy it as shown.

## Traps

- NEVER compute. No totals, sums, counts, averages, percentages, rates, unit
  conversions, emission factors, tCO2e, LTIFR, diversion rates, "times a
  thousand" or annual figures from monthly ones. The code derives those from the values you
  copy and labels them derived. If a figure is not printed, return null.
- NEVER convert a unit. A waste figure in tonnes stays in tonnes; litres stay
  litres; a "kg" column that plainly holds percentages stays as printed. Copy
  the number and its printed unit, and flag the doubt in exceptions. When the
  document prints NO unit, the unit is null: never assume kg, kWh or litres.
- A totals cell can hold the wrong thing. A "Total" row that does not add up,
  a total that skips a site, a cell labelled tCO2e that holds litres or kWh, a
  stray single digit where a total should be: copy what is printed and flag it
  in exceptions. Never replace it with your own sum.
- Months not yet reported are not zero. A workbook that prints 0 or "-" for
  months after its last actual month has no consumption figure for them; copy
  what is printed and note that those months are not yet reported. "N/A" is
  not zero either: copy "N/A" as printed; the code leaves N/A out of
  denominators.
- A billing period is not a calendar month. A bill "for July" may cover 29 May
  to 26 June. Copy the period dates the document prints; never move a reading
  into the month a person wrote on the file.
- Actual versus estimated. A reading marked estimated, average, interim,
  provisional or "no invoice" is still copied, with the reading type as
  printed. Never drop it and never upgrade it to actual.
- No universal targets. A policy rule ("spend at least 2% of profit", "a
  minimum of 60% local suppliers") is a rule, not a result and not a target
  the client has met. Never put a policy rule in a spend, percentage or
  achievement field, and never supply a target the document does not state.
- Do not decide scope or boundary. Which sites, divisions or vehicles are in
  the reporting boundary is declared by the client, not by you: report every
  site the document names, as named. Whether diesel is Scope 1 road fuel or
  stationary fuel, and whether carbon tax applies, is decided later from the
  activity you copy (vehicle, generator, forklift), never by you.
- Spreadsheet cells showing `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?` or `#N/A`
  hold NO value. Never return the error, and never return the error code a
  reader may show in its place (a bare 7 or 23 where `#DIV/0!` or `#REF!`
  stood). Return null and note the cell in exceptions.
- Hidden sheets, old copies and templates. A hidden tab can hold the only copy
  of real figures, or a stale copy: read it only when its own dates are this
  document's period, and always say in exceptions that it was hidden. A sheet
  dated a year earlier, a stale pivot, a copy identical to another year's, or
  a "template" tab is named in exceptions, never read as current figures.
- A blank form holds no data. A questionnaire, evaluation sheet or consent
  letter with empty answer boxes, unticked options or placeholder text
  ("(Supplier)", "[Site name]", "[date]") has no answers. Every answer field is
  null; never fill one from the questions, the legend or the example.
- Template text is not data: dropdown lists, legends, rating keys, example
  rows, instructions and headings are vocabulary, not evidence.
- Whose document is it? A landlord's recovery statement, a contractor's
  report, a supplier's questionnaire and a customer's survey each speak for
  someone else. Copy the issuer as the issuer and the client's site as the
  site; never make one the other.
- File names lie. A file named for one month may hold another; a handwritten
  note on a scan ("July") may name the month the client filed it under, not
  the billing period. Read the content; report the content's dates.
- Race, gender and disability are only ever what the document STATES. Never
  infer them from a name, a photo or an ID number.
- If the document is plainly not the type this skill describes, return null
  for every field and say what it is in exceptions; never force values into
  the wrong fields.
- Never return bank account numbers, card numbers, passwords, personal
  contact details or medical details beyond what a field asks for.
