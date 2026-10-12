---
id: event_calendar
newType:
  name: "Employee wellbeing and community events calendar"
  aliases: ["Staff events calendar", "Wellbeing calendar", "Social committee calendar"]
element: COMMUNITY_CSI
version: 1
hard: false
classify:
  is: "A year planner of the client's own staff and community events, laid out as one block per month: the month's name, a day number or date, the month's theme (a health, wellbeing or environment month), a line naming what the month is about, the activity, a cost or entry fee, a drive to gather goods for people in need, and the person or team who runs it, often under one theme for the year. It is a calendar of events, not a record of spend."
  isNot:
    - "a CSI or SED spend register with rand amounts per beneficiary"
    - "a training schedule or training register"
    - "a public holiday list on its own"
  filenameHints: ["social calendar", "events calendar", "wellbeing calendar", "year planner"]
  contentSignals: ["Calendar", "Theme", "Month", "Wellbeing", "Health", "Sustainability", "Event", "Donation", "Cost", "Entry fee", "Day"]
rowsField: event_rows
fields:
  - name: calendar_title
    type: text
    scope: document
    labels: ["Title"]
    description: "The calendar's own title, as printed."
  - name: calendar_theme
    type: text
    scope: document
    labels: ["Theme", "Our pillars"]
    description: "The calendar's overall theme or pillars when it prints one for the whole year (\"MOVE • NOURISH • CONSERVE\"), as printed."
  - name: calendar_year
    type: text
    scope: document
    labels: ["Year"]
    description: "The year the calendar plans, as printed."
  - name: event_month
    type: text
    required: true
    rowLevel: true
    labels: []
    description: "The month the event or theme belongs to, as printed."
  - name: event_date
    type: text
    rowLevel: true
    labels: []
    description: "The event's date. A spreadsheet day number (46108) is copied as the number, as printed; a written date as yyyy-mm-dd. Null when only a month is given."
  - name: event_theme
    type: text
    rowLevel: true
    labels: []
    description: "The month's theme, as printed (\"SPRING INTO STEPS\", \"OCEAN MONTH\")."
  - name: event_focus
    type: text
    rowLevel: true
    labels: []
    description: "The focus line, as printed, without its \"FOCUS:\" caption."
  - name: event_activity
    type: text
    rowLevel: true
    labels: []
    description: "What happens, as printed (the event, a competition, a collection)."
  - name: event_cost
    type: text
    rowLevel: true
    labels: []
    description: "The cost or entry fee as printed (\"R10\"), or null."
  - name: event_owner
    type: text
    rowLevel: true
    labels: []
    description: "The person or team who runs it, as printed (a first name, \"WELLBEING TEAM\", \"ALL\")."
  - name: event_is_community_collection
    type: bool
    rowLevel: true
    labels: []
    description: "True when the activity collects goods or money for people outside the company (a children.s home, a shelter). A collection's value is never estimated."
newFields: [calendar_title, calendar_theme, calendar_year, event_rows, event_month, event_date, event_theme, event_focus, event_activity, event_cost, event_owner, event_is_community_collection]
---
## What it is / is not

A planner the client's social or wellbeing committee keeps for the year: a
theme per month, a dated event, what it involves, what it costs staff, any
collection for a community cause, and who runs it. It evidences employee
wellbeing and community involvement (in-kind collections), not CSI spend.

It is NOT a CSI or SED spend register (no rand per beneficiary), a training
schedule, or a public-holiday list on its own.

## Where values sit

- A title and the year's pillars at the top.
- One block per month, often laid out side by side across the sheet: the month,
  the event date, the theme ("OCEAN MONTH"), a "FOCUS:" line, the activity,
  a cost line, and the owner's name at the foot of the block.
- A list matching months to owners, on a sheet of its own.
- Month grids (Mo Tu We ...) of day numbers: they are the calendar's pages,
  not events.

## Traps

- One row per month block. A month in the owner list with no block is still a
  row, with only its month and owner.
- Day numbers in the month grids are not events: read only the blocks.
- A spreadsheet day number (46108) is a date: copy the number as printed.
- A donation drive for a charity is in-kind: never give it a rand value.
- Hidden year pages (old years) are not this year's plan.

## Worked example

Invented, two month blocks side by side:

```
EXAMPLE CO SOCIAL CALENDAR 2026 — HEALTH • GIVING
A3 APRIL            | E3 AUGUST
A4 46136            | E4 46254
A5 OCEAN MONTH      | E5 KINDNESS MONTH
A6 FOCUS: RECYCLING | E6 FOCUS: SELF-CARE
A7 CLEAN-UP WALK    | E7 TOILETRIES DRIVE FOR A SHELTER
A8 COST: R20        | E8 COST: NONE
A9 THANDI           | E9 WELLBEING TEAM
```

```json
{"calendar_title": "EXAMPLE CO SOCIAL CALENDAR 2026", "calendar_theme": "HEALTH • GIVING", "calendar_year": "2026",
 "event_rows": [
   {"event_month": "APRIL", "event_date": "46136", "event_theme": "OCEAN MONTH", "event_focus": "RECYCLING", "event_activity": "CLEAN-UP WALK", "event_cost": "R20", "event_owner": "THANDI", "event_is_community_collection": false},
   {"event_month": "AUGUST", "event_date": "46254", "event_theme": "KINDNESS MONTH", "event_focus": "SELF-CARE", "event_activity": "TOILETRIES DRIVE FOR A SHELTER", "event_cost": "NONE", "event_owner": "WELLBEING TEAM", "event_is_community_collection": true}
 ],
 "exceptions": []}
```
