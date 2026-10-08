---
id: ee_plan
appliesTo:
  - employment_equity__ee_plan_and_forum_minutes
element: EMPLOYMENT_EQUITY
version: 1
hard: true
classify:
  is: "An Employment Equity plan (EEA13 or the employer's own plan document) or the minutes of the EE consultative forum: the plan's duration, objectives, barriers, affirmative action measures, numerical goals and annual targets, the senior manager assigned, and the consultation record."
  isNot:
    - "the workforce profile of an EEA2 or EEA12 report (read by the Employment Equity report skill), even when printed in the same file"
    - "an employment equity or diversity POLICY (rules, no plan period or goals)"
    - "an EEA4 income differential statement"
    - "a payroll report"
  filenameHints: ["eea13", "ee plan", "employment equity plan", "ee forum minutes", "ee committee minutes"]
  contentSignals: ["Employment Equity Plan", "Duration of the plan", "Numerical goals", "Numerical targets", "Barriers", "Affirmative action measures", "Consultation", "Senior manager assigned", "EEA13", "Section 20"]
rowsField: numerical_goal_rows
fields:
  - name: ee_plan_start_date
    type: date
    required: true
    labels: ["Duration of plan from", "Plan start date", "Start date of plan"]
    description: "The first day of the plan's duration, as printed."
  - name: ee_plan_end_date
    type: date
    required: true
    labels: ["Duration of plan to", "Plan end date", "End date of plan"]
    description: "The last day of the plan's duration, as printed. When an objectives table runs past this date, copy the printed plan end and note the later date in exceptions."
  - name: ee_plan_submitted_to_doel
    type: text
    labels: ["Submitted to the Department"]
    description: "Yes, No or Partial, only as the document states whether the plan was submitted to the Department. Null when it does not say."
  - name: ee_plan_submission_date
    type: date
    labels: ["Date submitted", "Submission date"]
    description: "A printed submission or acknowledgement date only. The date the plan was signed, or an e-signature audit-trail date, is not a submission date."
  - name: ee_forum_established
    type: text
    labels: ["Consultative forum", "EE forum established", "EE committee"]
    description: "Yes, No or Partial, as the document states whether a consultative forum or EE committee exists."
  - name: ee_forum_meeting_dates
    type: text
    labels: ["Meeting dates", "Date of meeting", "Consultation dates"]
    description: "Every forum or consultation meeting date printed, as written, separated by semicolons."
  - name: ee_forum_consulted
    type: text
    labels: ["Consulted with", "Consultation"]
    description: "Yes, No or Partial, as the document states whether employees or their representatives were consulted on the plan."
  - name: numerical_targets_set
    type: text
    labels: ["Numerical targets set"]
    description: "Yes when the plan prints numerical goals or targets; No when it says none were set; Null otherwise."
  - name: target_black_percent
    type: percent
    labels: ["Target black representation"]
    description: "Only a PERCENTAGE target the plan itself prints for black people. Numerical goals are headcounts, never converted to a percentage."
  - name: target_black_female_percent
    type: percent
    labels: ["Target black female representation"]
    description: "Only a printed percentage target for black women. Never computed from headcount goals."
  - name: target_disability_percent
    type: percent
    labels: ["Target people with disabilities"]
    description: "Only a printed percentage target for people with disabilities. Never computed."
  - name: barriers_analysis_done
    type: text
    labels: ["Barriers identified", "Analysis of barriers"]
    description: "Yes, No or Partial, as the document states whether a barriers analysis was done."
  - name: affirmative_measures_implemented
    type: text
    labels: ["Affirmative action measures"]
    description: "Yes, No or Partial, only as the document states. A plan that LISTS measures to take has not implemented them: say Partial or leave null, and quote the wording in exceptions."
  - name: ee_monitoring_and_reporting
    type: text
    labels: ["Monitoring and evaluation", "Internal monitoring"]
    description: "Yes, No or Partial, as the document states whether monitoring and reporting procedures exist."
  - name: ee_manager_assigned_name
    type: text
    labels: ["Senior manager assigned", "Assigned manager", "EE manager"]
    description: "The senior manager assigned to the plan, as printed."
  - name: goal_year_or_date
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The year or date the goal or target row is for (\"Year 1\", \"31/08/2027\", \"end of plan\"), as printed."
  - name: goal_occupational_level
    type: text
    rowLevel: true
    labels: []
    description: "The occupational level of the goal row, as printed."
  - name: goal_african_male
    type: count
    rowLevel: true
    labels: []
    description: "The goal for African men at this level and date, as printed."
  - name: goal_coloured_male
    type: count
    rowLevel: true
    labels: []
    description: "The goal for Coloured men, as printed."
  - name: goal_indian_male
    type: count
    rowLevel: true
    labels: []
    description: "The goal for Indian men, as printed."
  - name: goal_white_male
    type: count
    rowLevel: true
    labels: []
    description: "The goal for White men, as printed."
  - name: goal_african_female
    type: count
    rowLevel: true
    labels: []
    description: "The goal for African women, as printed."
  - name: goal_coloured_female
    type: count
    rowLevel: true
    labels: []
    description: "The goal for Coloured women, as printed."
  - name: goal_indian_female
    type: count
    rowLevel: true
    labels: []
    description: "The goal for Indian women, as printed."
  - name: goal_white_female
    type: count
    rowLevel: true
    labels: []
    description: "The goal for White women, as printed."
  - name: goal_total
    type: count
    rowLevel: true
    labels: []
    description: "The goal row's printed Total."
newFields: [numerical_goal_rows, goal_year_or_date, goal_occupational_level, goal_african_male, goal_coloured_male, goal_indian_male, goal_white_male, goal_african_female, goal_coloured_female, goal_indian_female, goal_white_female, goal_total]
---
## What it is / is not

An Employment Equity plan sets out, for a fixed duration (one to five years),
the employer's objectives, the barriers it found, the affirmative action
measures it will take, NUMERICAL GOALS for the end of the plan and annual
TARGETS, the consultation it did and the senior manager assigned to it. The
EEA13 is the Department's form of the plan; employers also write their own.
Forum or committee minutes record the consultation.

It is NOT the workforce profile (headcounts "as at" a date) of an EEA2 or EEA12
report, even when the same PDF carries both; NOT an EE or diversity policy;
NOT an EEA4 or a payroll report.

## Where values sit

- Duration ("from ... to ...") is near the top of the plan or in its first
  section. The senior manager assigned and the signature block are at the end.
- The numerical goals table has the workforce-profile shape: levels down the
  side, AM to WF across, a Total column. Annual target tables repeat it per
  year. Copy each printed row into `numerical_goal_rows` with its year or date.
- Consultation: a list of meeting dates, the forum's composition, or minutes
  with attendance.

## Traps

- Goals and targets are not headcounts, and headcounts are not goals. Copy
  goals only into the goal rows; never into a workforce field.
- A percentage target exists only when the plan prints a percentage. Never
  turn headcount goals into a percentage, and never supply the national
  economically active population figures as the client's target: there is no
  universal target.
- The signature date is not a submission date. An e-signature audit trail
  (sent, viewed, signed, completed) records signing, not submission to the
  Department.
- A plan that lists measures has not implemented them. Implementation,
  consultation and monitoring are Yes only where the document says they
  happened.
- An expired plan is still copied as printed: its end date is the evidence
  that it has lapsed. Never extend it to the objectives' last year.
- Never count meetings or goals yourself; copy what is printed.

## Worked example

Invented, an EE plan's duration, one goal row and the consultation line:

```
EMPLOYMENT EQUITY PLAN  Duration of plan: 01/03/2025 to 28/02/2028
Senior manager assigned: T. Mokoena (HR Executive)
Numerical goals at end of plan   AM CM IM WM AF CF IF WF Total
Skilled technical                30  6  2  4 25  5  1  2    75
Consultation: EE forum meetings 12/02/2025 and 19/02/2025
Signed 21/02/2025
```

```json
{"ee_plan_start_date": "01/03/2025", "ee_plan_end_date": "28/02/2028", "ee_plan_submitted_to_doel": null,
 "ee_plan_submission_date": null, "ee_forum_established": "Yes", "ee_forum_meeting_dates": "12/02/2025; 19/02/2025",
 "ee_forum_consulted": "Yes", "numerical_targets_set": "Yes", "target_black_percent": null,
 "target_black_female_percent": null, "target_disability_percent": null, "barriers_analysis_done": null,
 "affirmative_measures_implemented": null, "ee_monitoring_and_reporting": null, "ee_manager_assigned_name": "T. Mokoena",
 "numerical_goal_rows": [
   {"goal_year_or_date": "end of plan", "goal_occupational_level": "Skilled technical", "goal_african_male": 30, "goal_coloured_male": 6, "goal_indian_male": 2, "goal_white_male": 4, "goal_african_female": 25, "goal_coloured_female": 5, "goal_indian_female": 1, "goal_white_female": 2, "goal_total": 75}
 ],
 "exceptions": ["Signed 21/02/2025; no submission date is printed.", "Goals are headcounts; no percentage target is printed."]}
```
