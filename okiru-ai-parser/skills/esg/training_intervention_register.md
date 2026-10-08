---
id: training_intervention_register
appliesTo:
  - training__ofo_intervention_register
element: TRAINING
version: 1
hard: true
classify:
  is: "A register of training delivered, one row per learner per course (or per intervention): an annual training report (ATR) listing, a training intervention schedule, a learnership or attendance register, with course, provider, dates, cost and often the learner's race and gender."
  isNot:
    - "a training MATRIX of employees against required courses with ticks (read by the H&S training register skill)"
    - "the WSP / ATR SETA submission summary or approval letter (totals and grant figures)"
    - "an EEA2 workforce profile"
    - "a payroll report"
  filenameHints: ["atr", "training register", "training report", "training interventions", "learnership register", "attendance register"]
  contentSignals: ["Course", "Programme", "Training provider", "Learner", "Date", "Cost", "Total Expenditure", "NQF", "OFO", "SETA", "Race", "Gender"]
rowsField: training_intervention_rows
fields:
  - name: reporting_period_start
    type: date
    labels: ["Period from", "Reporting period"]
    description: "First day of the period the register covers, as printed (a sheet title or tab may carry it, e.g. \"Q1-Q3 2025\"; copy as printed)."
  - name: reporting_period_end
    type: date
    labels: ["Period to"]
    description: "Last day of the period, as printed."
  - name: interventions_total_count
    type: count
    labels: ["Total interventions", "Number of interventions"]
    description: "A printed total number of interventions only. Never count the rows."
  - name: learners_total_count
    type: count
    labels: ["Total learners", "Number of learners", "Total trained"]
    description: "A printed total number of learners only. Never count the rows."
  - name: training_spend_rand
    type: money
    labels: ["Total expenditure", "Total training spend", "Grand total"]
    description: "A total training spend the register prints on a total line only. Never add the cost column."
  - name: ofo_code
    type: text
    rowLevel: true
    labels: []
    description: "The OFO occupation code of the row, when printed."
  - name: learner_name
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The learner as printed (name, initials, or employee number). Spelling variants are copied as printed, never merged."
  - name: programme_name
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The course or programme name, as printed."
  - name: programme_category
    type: text
    rowLevel: true
    labels: []
    description: "The register's category or code for the course (a letter code, \"Learnership\", \"Short course\"), as printed. A code's meaning is never guessed when the key to it is not in the document."
  - name: training_provider_name
    type: text
    rowLevel: true
    labels: []
    description: "Who delivered the training (an external provider, or internal), as printed."
  - name: is_accredited_provider
    type: bool
    rowLevel: true
    labels: []
    description: "True only when the row states the provider is accredited."
  - name: seta_name
    type: text
    rowLevel: true
    labels: []
    description: "The SETA named for the row, when printed."
  - name: nqf_level
    type: text
    rowLevel: true
    labels: []
    description: "The NQF level, when printed."
  - name: training_start_date
    type: date
    rowLevel: true
    labels: []
    description: "The training date or start date exactly as printed: a single date, a range (\"8-12/06/2026\"), a spreadsheet serial or words. Never reformatted or guessed."
  - name: training_end_date
    type: date
    rowLevel: true
    labels: []
    description: "The end date when printed separately."
  - name: training_duration
    type: text
    rowLevel: true
    labels: []
    description: "Duration as printed (days, hours)."
  - name: training_status
    type: text
    rowLevel: true
    labels: []
    description: "Completed, in progress, planned or competent, as printed."
  - name: training_cost_rand
    type: money
    rowLevel: true
    labels: []
    description: "The cost on this row, as printed (from the column the register uses for spend). Blank stays null; a zero stays zero."
  - name: learner_race
    type: text
    rowLevel: true
    labels: []
    description: "The learner's race only as the register states it (typos copied as printed)."
  - name: learner_gender
    type: text
    rowLevel: true
    labels: []
    description: "The learner's gender only as the register states it."
  - name: learner_disability
    type: text
    rowLevel: true
    labels: []
    description: "Whether the learner has a disability, only as the register states it."
newFields: [learner_race, learner_gender, learner_disability]
---
## What it is / is not

A training register is the row-level evidence behind training indicators:
spend, people trained, hours, and the share of black, female, young or
disabled learners. One row is usually one learner on one course. The register
seldom prints totals; the code counts and adds up the rows, and computes the
shares from the race, gender and disability columns as the register states
them.

It is NOT a training matrix of required courses with ticks, the SETA
submission summary or approval letter, an EEA2 workforce profile or a payroll
report.

## Where values sit

- Columns: learner, employee number, race, gender, course, category, provider,
  dates, and one or more cost columns (often only "Total expenditure" is
  filled while other cost columns stay blank).
- The period may be printed only in the sheet's tab or title.
- Some registers write the learner once and leave following rows blank for
  more courses; those rows belong to the learner above.

## Traps

- Never count rows, never add costs, never compute percentages. A register
  without a total line has null totals.
- Copy each row's cost from the column the register uses for spend. A blank
  cost is null, not zero; a zero is zero. A cost stored as text ("R 1 250")
  is copied as printed.
- Dates come in every form: ranges, "3 & 4/11/2025", serial numbers,
  "5 MAY -". Copy them as printed; never reformat, and never correct a
  future date (it is flagged in exceptions).
- Race and gender only as stated; a misspelt value ("Afrcan") is copied as
  printed. Age is never inferred, so youth shares are left to a register
  that states age or birth dates.
- A category code whose key is not in the document is copied as a code; never
  guess what "B" or "E" means.
- A column that holds a stray letter where yes/blank is expected is copied as
  printed and flagged.

## Worked example

Invented, three register rows:

```
Learner        Emp no  Race     Gender  Course                     Cat  Provider          Date              Total Expenditure
N. Example     1042    African  Female  Forklift operator (refresh)  A  Example Training  03/03/2026        R 1 950.00
N. Example                               First aid level 1            D  Example Medics    24 & 25/03/2026
P. van Wyk     1188    White    Male    Defensive driving             A  Internal          46100             0
```

```json
{"reporting_period_start": null, "reporting_period_end": null, "interventions_total_count": null,
 "learners_total_count": null, "training_spend_rand": null,
 "training_intervention_rows": [
   {"learner_name": "N. Example", "programme_name": "Forklift operator (refresh)", "programme_category": "A", "training_provider_name": "Example Training", "training_start_date": "03/03/2026", "training_cost_rand": "R 1 950.00", "learner_race": "African", "learner_gender": "Female"},
   {"learner_name": "N. Example", "programme_name": "First aid level 1", "programme_category": "D", "training_provider_name": "Example Medics", "training_start_date": "24 & 25/03/2026", "training_cost_rand": null, "learner_race": "African", "learner_gender": "Female"},
   {"learner_name": "P. van Wyk", "programme_name": "Defensive driving", "programme_category": "A", "training_provider_name": "Internal", "training_start_date": "46100", "training_cost_rand": "0", "learner_race": "White", "learner_gender": "Male"}
 ],
 "exceptions": ["No total line is printed.", "The category key (A, D) is not in the document.", "The second row names no learner; it continues the row above."]}
```
