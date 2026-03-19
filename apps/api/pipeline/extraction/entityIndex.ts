export interface EntityConfig {
  name: string;
  entityType: string;
  patterns: string[];
  regex?: string;
  boostWeight: number;
  detectionMode: 'keyword' | 'regex';
}

export interface EntitySearchResult {
  name: string;
  normalizedValue: string;
  entityType: string;
  pageIds: string[];
  matchCount: number;
}

/**
 * B-BBEE-specific entity configurations for the entity index.
 */
export const DEFAULT_BBBEE_ENTITY_CONFIGS: EntityConfig[] = [
  {
    name: 'revenue',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['revenue', 'turnover', 'sales'],
    boostWeight: 2.0,
    detectionMode: 'keyword',
  },
  {
    name: 'npat',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['npat', 'net profit', 'profit after tax', 'net income'],
    boostWeight: 2.0,
    detectionMode: 'keyword',
  },
  {
    name: 'leviable_amount',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['leviable amount', 'payroll', 'total payroll', 'remuneration'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'tmps',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['tmps', 'total measured procurement spend', 'procurement spend'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'black_ownership',
    entityType: 'OWNERSHIP_METRIC',
    patterns: ['black ownership', 'bo%', 'hdsa'],
    boostWeight: 2.0,
    detectionMode: 'keyword',
  },
  {
    name: 'bee_level',
    entityType: 'BEE_METRIC',
    patterns: ['b-bbee level', 'bee level', 'contributor level'],
    boostWeight: 1.8,
    detectionMode: 'keyword',
  },
  {
    name: 'shareholders',
    entityType: 'OWNERSHIP_METRIC',
    patterns: ['shareholder', 'share register', 'equity'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'employees',
    entityType: 'HR_METRIC',
    patterns: ['employee', 'staff', 'personnel', 'human resources'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'skills_spend',
    entityType: 'SKILLS_METRIC',
    patterns: ['skills development', 'training spend', 'learnerships', 'bursaries'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'procurement',
    entityType: 'PROCUREMENT_METRIC',
    patterns: ['procurement', 'supplier', 'vendor'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'esd',
    entityType: 'ESD_METRIC',
    patterns: ['enterprise development', 'supplier development', 'esd'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'sed',
    entityType: 'SED_METRIC',
    patterns: [
      'socio-economic development',
      'sed',
      'csi',
      'corporate social',
    ],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
];

/**
 * Generic financial entity configurations (no B-BBEE-specific entities).
 */
export const DEFAULT_GENERIC_ENTITY_CONFIGS: EntityConfig[] = [
  {
    name: 'revenue',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['revenue', 'turnover', 'sales'],
    boostWeight: 2.0,
    detectionMode: 'keyword',
  },
  {
    name: 'profit',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['profit', 'income', 'net income', 'earnings'],
    boostWeight: 2.0,
    detectionMode: 'keyword',
  },
  {
    name: 'expenses',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['expenses', 'costs', 'expenditure', 'operating expenses'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'assets',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['assets', 'total assets', 'fixed assets', 'current assets'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'liabilities',
    entityType: 'FINANCIAL_METRIC',
    patterns: ['liabilities', 'total liabilities', 'current liabilities', 'debt'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'employees',
    entityType: 'HR_METRIC',
    patterns: ['employee', 'staff', 'personnel', 'human resources', 'headcount'],
    boostWeight: 1.5,
    detectionMode: 'keyword',
  },
  {
    name: 'dates',
    entityType: 'DATE_METRIC',
    patterns: ['date', 'year end', 'financial year', 'reporting period'],
    boostWeight: 1.2,
    detectionMode: 'keyword',
  },
];

/**
 * Entity index that maps entity configs (patterns) to the pages where they were found.
 */
export class EntityIndex {
  private pageEntityMap: Map<string, Map<string, number>> = new Map();
  private configs: EntityConfig[];
  private indexedPageIds: Set<string> = new Set();

  constructor(configs?: EntityConfig[]) {
    this.configs = configs ?? DEFAULT_BBBEE_ENTITY_CONFIGS;
    for (const config of this.configs) {
      this.pageEntityMap.set(config.name, new Map());
    }
  }

  /**
   * For each config, check if any pattern appears in text (case-insensitive).
   * If so, add the page to the entity's page map.
   */
  indexPage(pageId: string, text: string): void {
    const lowerText = text.toLowerCase();

    for (const config of this.configs) {
      let matchCount = 0;
      for (const pattern of config.patterns) {
        const lowerPattern = pattern.toLowerCase();
        let idx = 0;
        while ((idx = lowerText.indexOf(lowerPattern, idx)) !== -1) {
          matchCount++;
          idx += lowerPattern.length;
        }
      }

      if (matchCount > 0) {
        const entityMap = this.pageEntityMap.get(config.name)!;
        const existing = entityMap.get(pageId) ?? 0;
        entityMap.set(pageId, existing + matchCount);
      }
    }

    this.indexedPageIds.add(pageId);
  }

  /**
   * Find entities whose patterns match the query.
   * Returns sorted by matchCount descending.
   */
  searchEntities(query: string, exactMatch = false): EntitySearchResult[] {
    const lowerQuery = query.toLowerCase();
    const results: EntitySearchResult[] = [];

    for (const config of this.configs) {
      let queryMatchCount = 0;

      for (const pattern of config.patterns) {
        if (exactMatch) {
          if (lowerQuery === pattern.toLowerCase()) {
            queryMatchCount++;
          }
        } else {
          if (lowerQuery.includes(pattern.toLowerCase())) {
            queryMatchCount++;
          }
        }
      }

      if (queryMatchCount > 0) {
        const entityMap = this.pageEntityMap.get(config.name)!;
        const pageIds = [...entityMap.keys()];
        const totalDocMatches = [...entityMap.values()].reduce(
          (sum, c) => sum + c,
          0
        );

        results.push({
          name: config.name,
          normalizedValue: config.name,
          entityType: config.entityType,
          pageIds,
          matchCount: totalDocMatches,
        });
      }
    }

    return results.sort((a, b) => b.matchCount - a.matchCount);
  }

  /**
   * Look up entities by document. Not implemented for MVP.
   */
  lookupByDocument(documentId: string): string[] {
    return [];
  }

  getEntityConfig(name: string): EntityConfig | undefined {
    return this.configs.find((c) => c.name === name);
  }

  getStats(): { entityCount: number; indexedPages: number } {
    return {
      entityCount: this.configs.length,
      indexedPages: this.indexedPageIds.size,
    };
  }
}
