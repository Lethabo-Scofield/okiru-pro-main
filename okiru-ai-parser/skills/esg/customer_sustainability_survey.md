---
id: customer_sustainability_survey
newType:
  name: "Customer sustainability survey answered by the client"
  aliases: ["Customer sustainability questionnaire", "Buyer sustainability survey", "Customer ESG survey", "Supplier sustainability survey from a customer"]
element: GHG_ENERGY
version: 1
hard: false
classify:
  is: "A customer's or buyer's sustainability survey that the CLIENT filled in about its own sites: a grid of numbered questions across the top (storage surface, electricity and fuel consumption, solar panels, generators, forklifts, fuel tanks, washing stations) and the client's answers per site and per period (semester, year) down the side."
  isNot:
    - "a questionnaire the client sent to ITS suppliers, or an evaluation of a supplier (read by the supplier questionnaire skill)"
    - "the client's own monthly environmental data workbook (sites down the side, months across)"
    - "a GHG emissions system export"
  filenameHints: ["customer sustainability survey", "customer esg survey", "buyer sustainability questionnaire"]
  contentSignals: ["Are you using", "Do you have", "How many", "Who owns", "Total annual", "semester", "consumption", "square meters", "solar panels", "forklifts", "fuel tank", "Unit of measurement"]
rowsField: survey_answer_rows
fields:
  - name: survey_title
    type: text
    labels: ["Survey", "Questionnaire"]
    description: "The survey's own title, as printed. Null when it prints none."
  - name: survey_respondent
    type: text
    labels: ["Respondent", "Supplier", "Company"]
    description: "The company that answered, as printed in the survey's own cells. Never taken from the file name."
  - name: answer_group
    type: text
    rowLevel: true
    labels: []
    description: "The site (or other group) the answer is for, as printed on its heading line."
  - name: answer_row_label
    type: text
    rowLevel: true
    labels: []
    description: "The row the answer is on, as printed: its period (\"1st half 2025\") or year."
  - name: answer_question
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The question, as printed in its column heading, code included."
  - name: answer_value
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The answer, exactly as printed (\"1,234\", \"yes\", \"none\", \"40000l\"). Never converted to the unit the question asks for."
newFields: [survey_title, survey_respondent, survey_answer_rows, answer_group, answer_row_label, answer_question, answer_value]
---
## What it is / is not

Customers ask their suppliers for sustainability data in their own survey
format: a grid of numbered questions across the top, and the supplier's
answers per site and per period down the side. Here the CLIENT is the
supplier answering about its own warehouses: floor area, electricity, fuels,
solar, generators, forklifts, fuel tanks, washing stations.

It is NOT a questionnaire the client sends to its own suppliers, nor an
evaluation of a supplier (both read by the supplier questionnaire skill),
nor the client's monthly data workbook, nor an emissions system export. Its
answers are the client's own statements to a customer: reported as printed,
never placed as measured consumption.

## Where values sit

- The questions: one per column, in the header row, each with its code
  ("A03.14-Total electricity consumption ... (KWh)").
- A site heading line ("SOUTH AFRICA_EXAMPLE NORTH 2024") over that site's
  period rows ("1st half 2025", "2nd half 2025").
- Each answer in the cell under its question, on its site's period row.

## Traps

- The grid is read cell by cell by the code: every answer keeps its site, its
  period and its question.
- An answer in the wrong unit is copied as printed: a tank capacity asked in
  m3 and answered "40000l" stays "40000l"; a consumption question answered
  with a figure far below what it asks for (2.4 under "kWh per year") is copied and
  flagged, never corrected.
- "none", "n/a" and blanks are different answers: copy "none" and "n/a" as
  printed; a blank is no answer.
- The survey's answers are the client's claims to a customer, not bills or
  meter readings: never totals, never placed as the year's consumption.

## Worked example

Invented, one site with two half-years:

```
| Year | ITEMS | Q01-Storage surface (m2) | Q02-Total electricity (kWh) | Q03-Solar panels on site? |
| 2024 | EXAMPLE CO NORTH 2024 | | | |
| 1st half 2025 | | 1,200 | 52 000 | yes |
| 2nd half 2025 | | 1,150 | 49 500 | yes |
```

```json
{"survey_title": null, "survey_respondent": null,
 "survey_answer_rows": [
   {"answer_group": "EXAMPLE CO NORTH 2024", "answer_row_label": "1st half 2025", "answer_question": "Q01-Storage surface (m2)", "answer_value": "1,200"},
   {"answer_group": "EXAMPLE CO NORTH 2024", "answer_row_label": "1st half 2025", "answer_question": "Q02-Total electricity (kWh)", "answer_value": "52 000"},
   {"answer_group": "EXAMPLE CO NORTH 2024", "answer_row_label": "1st half 2025", "answer_question": "Q03-Solar panels on site?", "answer_value": "yes"}
 ],
 "exceptions": []}
```
