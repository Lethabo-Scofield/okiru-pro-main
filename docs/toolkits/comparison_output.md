## Target vs maximum reachable (live `sectorConfig.ts`)

| Sector | Target (denominator) | Bonus available | Max reachable |
|--------|---------------------:|----------------:|--------------:|
| RCOGP_GENERIC | 120 | 9 | 120 |
| ICT_GENERIC | 140 | 10 | 140 |
| FSC_GENERIC | 119 | 11 | 119 |
| FSC_BANKS | 132 | 9 | 132 |
| FSC_LTI | 134 | 11 | 134 |
| FSC_STI | 129 | 11 | 129 |
| AGRI_GENERIC | 132 | 9 | 132 |
| RCOGP_QSE | 108 | 8 | 108 |
| ICT_QSE | 116 | 9 | 116 |
| FSC_QSE | 100 | 6 | 100 |
| TRANSPORT_GENERIC | 108 | 6 | 108 |
| TRANSPORT_QSE | 100 | 7 | 107 **← bonus lifts above target** |
| CONSTRUCTION_QSE | 110 | 0 | 110 |
| CONSTRUCTION_CONTRACTOR | 123 | 0 | 123 |
| CONSTRUCTION_BEP | 123 | 0 | 123 |
| MAC_GENERIC | 138 | 14 | 138 |
| MAC_QSE | 115 | 10 | 115 |

Where target == reachable the sector's `totalMaxPoints` already includes its bonus points; the split still matters per element, because an entity on full base points must read 100% of that element rather than short of a merged cap.

---

### RCOGP Generic

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 120.0 | 120 | YES |
| Ownership | 25.0 | 25 | YES |
| Management Control | 19.0 | 19 | YES |
| Skills Development | 25.0 | 25 | YES |
| Preferential Procurement | 29.0 | 29 | YES |
| Supplier Development | 10.0 | 10 | YES |
| Enterprise Development | 7.0 | 7 | YES |
| SED | 5.0 | 5 | YES |

#### Management Control Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Board Black | 2.0 | 2 | YES |
| Board BW | 1.0 | 1 | YES |
| Exec Black | 2.0 | 2 | YES |
| Exec BW | 1.0 | 1 | YES |
| Other Exec Black | 2.0 | 2 | YES |
| Other Exec BW | 1.0 | 1 | YES |
| Senior | 2.0 | 2 | YES |
| Senior BW | 1.0 | 1 | YES |
| Middle | 2.0 | 2 | YES |
| Middle BW | 1.0 | 1 | YES |
| Junior | 1.0 | 1 | YES |
| Junior BW | 1.0 | 1 | YES |
| Disabled | 2.0 | 2 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learning Programmes | 6.0 | 6 | YES |
| Disabled Learning | 4.0 | 4 | YES |
| Learnerships | 6.0 | 6 | YES |
| Absorption | 5.0 | 5 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| QSE | 3.0 | 3 | YES |
| EME | 4.0 | 4 | YES |
| BO51 | 11.0 | 11 | YES |
| BWO30 | 4.0 | 4 | YES |
| Designated Group | 2.0 | 2 | YES |

---

### ICT Generic

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 140.0 | 140 | YES |
| Ownership | 25.0 | 25 | YES |
| Management Control | 23.0 | 23 | YES |
| Employment Equity | N/A | 0 | - |
| Skills Development | 25.0 | 25 | YES |
| Preferential Procurement | 27.0 | 27 | YES |
| Supplier Development | 10.0 | 10 | YES |
| Enterprise Development | 18.0 | 18 | YES |
| SED | 12.0 | 12 | YES |

#### Management Control Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Board Black | 3.0 | 3 | YES |
| Board BW | 2.0 | 2 | YES |
| Exec Black | 2.0 | 2 | YES |
| Exec BW | 1.0 | 1 | YES |
| Other Exec Black | 3.0 | 3 | YES |
| Other Exec BW | 2.0 | 2 | YES |
| Senior | 2.0 | 2 | YES |
| Senior BW | 1.0 | 1 | YES |
| Middle | 2.0 | 2 | YES |
| Middle BW | 1.0 | 1 | YES |
| Junior | 1.0 | 1 | YES |
| Junior BW | 1.0 | 1 | YES |
| Disabled | 2.0 | 2 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learning Programmes | 8.0 | 8 | YES |
| Disabled Learning | 4.0 | 4 | YES |
| Learnerships | 4.0 | 4 | YES |
| Absorption | 5.0 | 5 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| QSE | 3.0 | 3 | YES |
| EME | 4.0 | 4 | YES |
| BO51 | 9.0 | 9 | YES |
| BWO30 | 4.0 | 4 | YES |
| Designated Group | 2.0 | 2 | YES |

---

### FSC Generic

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 120.0 | 119 | GAZETTE |
| Ownership | 25.0 | 25 | YES |
| Management Control | 21.0 | 20 | GAZETTE |
| Employment Equity | N/A | 0 | - |
| Skills Development | 23.0 | 23 | YES |
| Preferential Procurement | 24.0 | 24 | YES |
| Supplier Development | 10.0 | 10 | YES |
| Enterprise Development | 9.0 | 9 | YES |
| SED | N/A | 8 | - |

#### Management Control Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Board Black | 2.0 | 1 | GAZETTE |
| Board BW | 1.0 | 1 | YES |
| Exec Black | 2.0 | 2 | YES |
| Exec BW | 1.0 | 1 | YES |
| Other Exec Black | 10.0 | 10 | YES |
| Other Exec BW | 4.0 | 4 | YES |
| Senior | 0.0 | 0 | YES |
| Senior BW | 0.0 | 0 | YES |
| Middle | 0.0 | 0 | YES |
| Middle BW | 0.0 | 0 | YES |
| Junior | 0.0 | 0 | YES |
| Junior BW | 0.0 | 0 | YES |
| Disabled | 1.0 | 1 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learnerships | 4.0 | 4 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| QSE | 3.0 | 3 | YES |
| EME | 2.0 | 2 | YES |
| BO51 | 7.0 | 7 | YES |
| BWO30 | 3.0 | 3 | YES |

---

### AGRI Generic (AgriBEE)

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 132.0 | 132 | YES |
| Ownership | 25.0 | 25 | YES |
| Management Control | 23.0 | 23 | YES |
| Employment Equity | N/A | 0 | - |
| Skills Development | 25.0 | 25 | YES |
| Preferential Procurement | 27.0 | 27 | YES |
| Supplier Development | 10.0 | 10 | YES |
| Enterprise Development | 7.0 | 7 | YES |
| SED | 15.0 | 15 | YES |

#### Management Control Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Board Black | 3.0 | 3 | YES |
| Board BW | 2.0 | 2 | YES |
| Exec Black | 2.0 | 2 | YES |
| Exec BW | 1.0 | 1 | YES |
| Other Exec Black | 3.0 | 3 | YES |
| Other Exec BW | 2.0 | 2 | YES |
| Senior | 2.0 | 2 | YES |
| Senior BW | 1.0 | 1 | YES |
| Middle | 2.0 | 2 | YES |
| Middle BW | 1.0 | 1 | YES |
| Junior | 1.0 | 1 | YES |
| Junior BW | 1.0 | 1 | YES |
| Disabled | 2.0 | 2 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learning Programmes | 8.0 | 8 | YES |
| Disabled Learning | 4.0 | 4 | YES |
| Learnerships | 4.0 | 4 | YES |
| Absorption | 5.0 | 5 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| QSE | 3.0 | 3 | YES |
| EME | 4.0 | 4 | YES |
| BO51 | 9.0 | 9 | YES |
| BWO30 | 4.0 | 4 | YES |
| Designated Group | 2.0 | 2 | YES |

---

### RCOGP QSE

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 108.0 | 108 | YES |
| Ownership | 25.0 | 25 | YES |
| Management Control | 15.0 | 15 | YES |
| Skills Development | 30.0 | 30 | YES |
| Preferential Procurement | 21.0 | 21 | YES |
| Supplier Development | 5.0 | 5 | YES |
| Enterprise Development | 7.0 | 7 | YES |
| SED | 5.0 | 5 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learning Programmes | 15.0 | 15 | YES |
| Disabled Learning | 3.0 | 3 | YES |
| Absorption | 5.0 | 5 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| EME | 0.0 | 0 | YES |
| BO51 | 5.0 | 5 | YES |
| Designated Group | 1.0 | 1 | YES |

---

### ICT QSE

#### Summary Scorecard (Pillar Max Points)

| Pillar | Excel | Codebase | Match? |
|--------|-------|----------|--------|
| Grand Total | 116.0 | 116 | YES |
| Ownership | 25.0 | 25 | YES |
| Management Control | 15.0 | 15 | YES |
| Skills Development | 30.0 | 30 | YES |
| Preferential Procurement | 21.0 | 21 | YES |
| Supplier Development | 5.0 | 5 | YES |
| Enterprise Development | 8.0 | 8 | YES |
| SED | 12.0 | 12 | YES |

#### Skills Development Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| Learning Programmes | 15.0 | 15 | YES |
| Disabled Learning | 3.0 | 3 | YES |
| Absorption | 5.0 | 5 | YES |

#### Procurement Criterion Points

| Criterion | Excel | Codebase | Match? |
|-----------|-------|----------|--------|
| EME | 0.0 | 0 | YES |
| BO51 | 5.0 | 5 | YES |
| Designated Group | 1.0 | 1 | YES |

---
