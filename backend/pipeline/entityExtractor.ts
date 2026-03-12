/**
 * NER-style entity extraction for B-BBEE data from Excel cell values.
 * Detects financial amounts (ZAR), percentages, dates, names, levels, races, genders.
 */

export interface ExtractedEntity {
  type: 'currency' | 'percentage' | 'date' | 'person_name' | 'company_name' | 'bee_level' | 'race' | 'gender' | 'designation' | 'number';
  value: any;
  raw: string;
  confidence: number;
}

const RACE_PATTERNS: Record<string, string[]> = {
  'African': ['african', 'black', 'af', 'a', 'ba', 'black african'],
  'Coloured': ['coloured', 'colored', 'col', 'c', 'bc'],
  'Indian': ['indian', 'ind', 'i', 'bi', 'asian'],
  'White': ['white', 'wh', 'w', 'caucasian'],
};

const GENDER_PATTERNS: Record<string, string[]> = {
  'Male': ['male', 'm', 'man', 'mr'],
  'Female': ['female', 'f', 'woman', 'ms', 'mrs', 'miss'],
};

const DESIGNATION_PATTERNS: Record<string, string[]> = {
  'Board': ['board', 'director', 'non-executive', 'non executive', 'ned', 'chairperson', 'chairman'],
  'Executive': ['executive', 'exec', 'ceo', 'cfo', 'coo', 'cto', 'md', 'managing director', 'chief', 'ex dir'],
  'Senior': ['senior', 'sr', 'senior management', 'snr', 'general manager', 'gm', 'head of'],
  'Middle': ['middle', 'mid', 'middle management', 'manager', 'specialist'],
  'Junior': ['junior', 'jr', 'junior management', 'trainee', 'intern', 'clerk', 'assistant', 'entry'],
};

export function extractEntity(value: any): ExtractedEntity | null {
  if (value === null || value === undefined || value === '') return null;

  const str = String(value).trim();
  if (!str) return null;

  // Currency detection (ZAR)
  const currencyMatch = str.match(/^R?\s*([\d,\s]+\.?\d*)\s*(m|k|bn|million|thousand|billion)?$/i);
  if (currencyMatch) {
    let num = parseFloat(currencyMatch[1].replace(/[,\s]/g, ''));
    const suffix = (currencyMatch[2] || '').toLowerCase();
    if (suffix === 'm' || suffix === 'million') num *= 1000000;
    if (suffix === 'k' || suffix === 'thousand') num *= 1000;
    if (suffix === 'bn' || suffix === 'billion') num *= 1000000000;
    if (!isNaN(num) && num > 0) {
      return { type: 'currency', value: num, raw: str, confidence: 0.85 };
    }
  }

  // Percentage
  const percentMatch = str.match(/^(\d+\.?\d*)\s*%$/);
  if (percentMatch) {
    const pct = parseFloat(percentMatch[1]);
    return { type: 'percentage', value: pct / 100, raw: str, confidence: 0.95 };
  }

  // Decimal that looks like a percentage (0.0 - 1.0)
  if (typeof value === 'number' && value >= 0 && value <= 1 && str.includes('.')) {
    return { type: 'percentage', value: value, raw: str, confidence: 0.7 };
  }

  // B-BBEE Level
  const levelMatch = str.match(/^(?:level\s*)?([1-8])$/i);
  if (levelMatch) {
    return { type: 'bee_level', value: parseInt(levelMatch[1]), raw: str, confidence: 0.9 };
  }

  // Non-compliant
  if (/non[-\s]?compliant|nc|n\/c|0/i.test(str) && str.length < 20) {
    return { type: 'bee_level', value: 0, raw: str, confidence: 0.85 };
  }

  // Race
  const lowerStr = str.toLowerCase().trim();
  for (const [race, patterns] of Object.entries(RACE_PATTERNS)) {
    if (patterns.includes(lowerStr)) {
      return { type: 'race', value: race, raw: str, confidence: 0.9 };
    }
  }

  // Gender
  for (const [gender, patterns] of Object.entries(GENDER_PATTERNS)) {
    if (patterns.includes(lowerStr)) {
      return { type: 'gender', value: gender, raw: str, confidence: 0.9 };
    }
  }

  // Designation
  for (const [designation, patterns] of Object.entries(DESIGNATION_PATTERNS)) {
    for (const p of patterns) {
      if (lowerStr === p || lowerStr.includes(p)) {
        return { type: 'designation', value: designation, raw: str, confidence: 0.8 };
      }
    }
  }

  // Number
  if (typeof value === 'number' && !isNaN(value)) {
    return { type: 'number', value: value, raw: str, confidence: 0.9 };
  }
  const numMatch = str.replace(/[,\s]/g, '');
  if (/^\d+\.?\d*$/.test(numMatch)) {
    return { type: 'number', value: parseFloat(numMatch), raw: str, confidence: 0.8 };
  }

  // If it's a string with 2+ words starting with capitals → likely a name
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+/.test(str) && str.length < 60) {
    return { type: 'person_name', value: str, raw: str, confidence: 0.7 };
  }

  // Company name patterns
  if (/\b(pty|ltd|holdings|group|inc|corp|cc|trust|foundation|npc)\b/i.test(str)) {
    return { type: 'company_name', value: str, raw: str, confidence: 0.85 };
  }

  return null;
}

export function extractCurrency(value: any): number | null {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const entity = extractEntity(value);
  if (entity && (entity.type === 'currency' || entity.type === 'number')) return entity.value;
  return null;
}

export function extractPercentage(value: any): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return value > 1 ? value / 100 : value;
  }
  const entity = extractEntity(value);
  if (entity && entity.type === 'percentage') return entity.value;
  return null;
}
