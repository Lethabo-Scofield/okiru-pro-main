---
id: _global
version: 1
---
Traps that apply to every South African B-BBEE evidence document. Each skill's
own traps come first; these are always added after them.

## Where values sit

- Scanned pages reach you as OCR text. Tables may arrive as pipe tables, as
  `label: value` lines, or as HTML. Read the CELL CONTENT; the markup around it
  is never a value.
- A value usually sits in the cell to the RIGHT of its label, or in the cell
  BELOW a column heading. When a heading wraps over two lines ("NAME AND" /
  "SURNAME"), both lines are the heading and the value is in the next row.
- Totals rows are labelled "TOTAL", "Totals", "Grand total" or sit under a
  ruled line at the foot of a column. A total is a document-level field, never
  a row.

## Traps

- NEVER return markup or a heading as a value: `</td>`, `<th>`, `AND SURNAME`,
  `Registration Number` (as a column heading) and `Enterprise Name` are not
  values. If the only thing next to a label is another label, the value is null.
- Capture ONE value, not the rest of the line. A company name never runs on
  into its registration number, address and change history; stop at the next
  label, cell or line break.
- CIPC registration numbers are `YYYY/NNNNNN/NN` and are often PRINTED WITH
  SPACES around the slashes ("2015 / 123456 / 07"). That is the same, valid
  number. Copy it as printed; never drop it for having spaces. The last two
  digits are the entity type: 07 private company (Pty) Ltd, 06 public company
  (Ltd), 08 non-profit company (NPC), 21 personal liability company (Inc), 23
  close corporation (CC).
- South African ID numbers are 13 digits (YYMMDD SSSS C A Z), often printed in
  groups ("800101 5009 087"). The 11th digit is citizenship (0 = SA citizen,
  1 = permanent resident). A passport number (letters and digits) is not an ID
  number; copy it as printed and say so in exceptions.
- B-BBEE levels are often WRITTEN IN WORDS: "LEVEL ONE CONTRIBUTOR", "Level
  Four". That is the level. "Non-Compliant Contributor" is a status, not a
  missing value.
- Amounts: South African documents use spaces or commas as thousand
  separators ("1 234 567" / "1,234,567"), "R" prefixes, and BRACKETS for
  negatives ("(41 250)" is minus 41 250). Keep the sign. A loss is a negative
  figure, not a missing one.
- A DATE is never an amount, and an amount field is never filled with a date.
  "Expenditure" contains the letters "end" — it is not an end date.
- "ID no", "Reg no", "VAT no" are labels for numbers; the "no" is not the
  answer to a yes/no question, and "ID no" is not a signature or signed date.
- Dates are day-first (dd/mm/yyyy). "30/06/2025" is 30 June 2025.
- Copy what the document states. Do not compute totals, percentages, annual
  figures from monthly ones, or a level from points. If a value is not printed,
  return null and, where it matters, explain in exceptions.
- Spreadsheet cells showing `#REF!`, `#VALUE!`, `#DIV/0!` or `#N/A` hold NO
  value. Never return the error, and never substitute a nearby number for it;
  report it in exceptions.
- Template text is not data: dropdown option lists, "Reference options",
  legends, example rows and instructions are vocabulary, not evidence.
- Race and gender are only ever what the document STATES (a declaration, an
  EEA1, an EE register column). Never infer them from a name or a surname.
