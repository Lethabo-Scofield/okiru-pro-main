---
id: _global
version: 2
---
Rules for reading ANY South African B-BBEE verification document: CIPC
records, share registers, SARS returns, Employment Equity forms, SETA
documents, financial statements, supplier certificates and affidavits,
ledgers, proofs of payment and the information-gathering workbooks agencies
hand to clients. Each skill's own traps come first; these are always added
after them and are never relaxed by a skill.

## Where values sit

- You report what the document STATES. You are not the verifier: do not
  decide whether a claim scores, do not repair the document, and do not fill
  a gap from another document in the pack.
- Return ONE flat JSON object: the skill's field names as keys, row fields as
  an array of objects under the skill's rows field, and `exceptions` (a list of
  short notes). A value the document does not state is null.
- Scanned pages reach you as OCR text. Tables may arrive as pipe tables, as
  `label: value` lines, or as HTML. Read the CELL CONTENT; the markup around it
  is never a value.
- A value usually sits in the cell to the RIGHT of its label, or in the cell
  BELOW a column heading. On forms (CIPC, EEA1, EMP201) the label and its value
  are often separate cells or separate lines: read the pair, not the line.
  When a heading wraps over two lines ("NAME AND" / "SURNAME"), both lines are
  the heading and the value is in the next row.
- Totals rows are labelled "Total", "Totals", "Grand total" or sit under a
  ruled line at the foot of a column. A total is a document-level field, never
  a row.
- Handwriting beats print. When a printed word is struck through and replaced
  by hand ("employee" crossed out, "owner" written in), report the handwritten
  value and say so in exceptions.
- Amounts: South African documents use spaces or commas as thousand
  separators ("1 234 567", "1,234,567.89"), sometimes a decimal comma
  ("1 234 567,89"), "R" prefixes, and BRACKETS for negatives ("(41 250)" is
  minus 41 250). Copy the figure with its sign as printed. When a column says
  "R'000" or "R thousands", copy the figure and note the unit in exceptions;
  never rescale it.
- Dates are day-first: "03/04/2025" is 3 April 2025. Copy dates as printed;
  code converts them.

## Traps

- NEVER return markup or a heading as a value: `</td>`, `<th>`, `AND SURNAME`,
  `Registration Number` (as a column heading) and `Enterprise Name` are not
  values. If the only thing next to a label is another label, a heading or a
  sentence fragment ("we have", "the company"), the value is null.
- Capture ONE value, not the rest of the line. A company name never runs on
  into its registration number, address and change history; stop at the next
  label, cell or line break.
- CIPC registration numbers are `YYYY/NNNNNN/NN` and are often PRINTED WITH
  SPACES around the slashes ("2015 / 123456 / 07"), without slashes, or with a
  `K` prefix. It is the same, valid number. Copy it as printed; never drop it
  for its spacing. The last two digits are the entity type: 07 private company
  (Pty) Ltd, 06 public company (Ltd), 08 non-profit company (NPC), 21 personal
  liability company (Inc), 23 close corporation (CC).
- Tax references are text, copied as printed: a VAT number is 10 digits
  starting with 4; a PAYE reference is 10 digits starting with 7; the SDL and
  UIF references are the same last nine digits with an `L` or `U` prefix.
- South African ID numbers are 13 digits (YYMMDD SSSS C A Z), often printed in
  groups ("800101 5009 087"). The 11th digit is citizenship (0 = SA citizen,
  1 = permanent resident). A passport number (letters and digits) is not an ID
  number; copy it as printed and say so in exceptions. An ID number never
  gives race.
- B-BBEE levels are often WRITTEN IN WORDS: "LEVEL ONE CONTRIBUTOR", "Level
  Four". That is the level; copy it as printed. "Non-Compliant Contributor" is
  a status, not a missing value. The procurement recognition percentage (135%,
  125%, 110%, 100%, 80%, 60%, 50%, 10%, 0%) is not black ownership.
- A DATE is never an amount, and an amount field is never filled with a date.
  "Expenditure" contains the letters "end"; it is not an end date. A column
  heading such as "28 February 20XX" names the year the column belongs to; it
  is not a value.
- "ID no", "Reg no", "VAT no" and "Tel no" are labels for numbers; the "no" is
  not the answer to a yes/no question, and "ID no" is not a signature or a
  signed date. Whether a document is signed comes from a signature, initials or
  a stamp; a signed date is the date written beside it.
- Copy what the document states. NEVER compute: no totals, counts,
  percentages, averages, VAT conversions, annual figures from monthly ones, a
  level from points, or "x 100". The code derives those from the values you
  copy and labels them as derived. If a figure is not printed, return null.
- A tax loss is not TMPS. "Assessed loss", "tax loss carried forward",
  "deferred tax" and other tax-note figures are never Total Measured
  Procurement Spend. TMPS is only a figure the document labels as TMPS, or a
  TMPS calculation the document itself shows.
- The certified-supplier total is not TMPS. The total at the top of a
  procurement or supplier-schedule sheet is the spend with the listed
  suppliers, not the denominator. Neither is a total "before exclusions", nor
  a count of suppliers.
- An Imports sheet lists goods bought from outside South Africa. Its total is
  not TMPS and not local spend; how imports are treated is decided by the
  Codes and the verifier, not by you. A clearly local party listed there is
  reported as entered and flagged in exceptions.
- Rows that wrap. In a one-row-per-entry table, a row holding only the end of
  a name or description ("Furniture (Pty) Ltd" under "Khanya Stationery and
  Office") continues the entry above it: join the fragments into one entry. A
  row with only an amount, hours or a date also continues the entry above it.
  Never copy a person or supplier into a row that names nobody.
- A block with the name written once. Schedules often state the beneficiary,
  supplier or learner only on the first row of a block and leave the following
  rows blank. The blank rows belong to the last name stated above them, until
  the next name appears.
- Spreadsheet cells showing `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?` or `#N/A`
  hold NO value. Never return the error, and never substitute a nearby number
  or an error code for it; return null and note the cell in exceptions.
- Template text is not data: dropdown option lists, "Reference options",
  legends, example rows, category catalogues and instructions are vocabulary,
  not evidence.
- Dates outside the measurement period are still reported as stated. Never
  drop, move or "correct" a date; whether it falls inside the measurement
  period is checked later in code, not by you.
- File names lie. A file named for one thing may hold another (a "training
  evidence" file holding only SARS returns; a year in the name that differs
  from the year in the content). Read the content; report the content's year.
- Whose document is it? The measured entity is the client being verified. A
  supplier's registration number, level or address is the supplier's, never
  the client's, and the client's own registration number is never a supplier.
- One person, many spellings: initials, full names and nicknames can be the
  same person across documents. Report each as written; never merge or expand
  them yourself.
- Race and gender are only ever what the document STATES (a declaration, an
  EEA1, an EE register column). Never infer them from a name, a surname, a
  photo or an ID number.
- If the document is plainly not the type this skill describes, return null
  for every field and say what it is in exceptions; never force values into
  the wrong fields.
- Never return bank account numbers, card numbers, passwords, contact details
  or medical details beyond what a field asks for.
