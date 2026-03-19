/**
 * TypeScript HTTP client for the Python Computation Engine.
 * Proxies calls to http://127.0.0.1:8000 using native fetch (no npm deps).
 */

import fs from 'fs';
import path from 'path';

export interface ComputeEngineConfig {
  baseUrl: string; // default http://127.0.0.1:8000
  timeoutMs: number; // default 120000 (2 min for large compilations)
}

export interface ModelVersion {
  version_id: string;
  name: string;
  status: string;
  cell_count: number;
  formula_count: number;
  input_count: number;
  output_count: number;
  created_at: string;
  compiled_at?: string;
  error?: string;
}

export interface ModelSummary {
  version_id: string;
  name: string;
  status: string;
  cell_count: number;
  formula_count: number;
  input_count: number;
  output_count: number;
  graph: { nodes: number; edges: number };
}

export interface EvaluationResult {
  results: Record<string, any>;
  stats: {
    total_cells: number;
    evaluated: number;
    overridden: number;
    inputs: number;
    outputs: number;
  };
}

export class ComputeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: Partial<ComputeEngineConfig>) {
    this.baseUrl = (
      config?.baseUrl ??
      process.env.COMPUTE_ENGINE_URL ??
      'http://127.0.0.1:8000'
    ).replace(/\/$/, '');
    this.timeoutMs = config?.timeoutMs ?? 120_000;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit & { body?: BodyInit }
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'X-Admin': 'true',
          ...(init.headers as Record<string, string>),
        },
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleResponse<T>(res: Response, parseJson = true): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Compute Engine error ${res.status}: ${text || res.statusText}`);
    }
    if (parseJson) {
      return res.json() as Promise<T>;
    }
    await res.text(); // drain body
    return undefined as T;
  }

  /**
   * Check if the Computation Engine is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/admin/models/list`);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Upload and compile an Excel toolkit file.
   */
  async compileToolkit(
    filePath: string,
    name: string,
    metadata?: Record<string, string>
  ): Promise<ModelVersion> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = `----FormBoundary${Date.now()}`;

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;

    const prefix = Buffer.from(body, 'utf-8');
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const fullBody = Buffer.concat([prefix, fileBuffer, suffix]);

    const params = new URLSearchParams({ name });
    if (metadata && Object.keys(metadata).length > 0) {
      params.set('metadata', JSON.stringify(metadata));
    }
    const queryString = params.toString();
    const url = `${this.baseUrl}/admin/models/upload${queryString ? `?${queryString}` : ''}`;

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
    });

    return this.handleResponse<ModelVersion>(res);
  }

  /**
   * List all model versions.
   */
  async listModels(): Promise<ModelVersion[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/admin/models/list`);
    return this.handleResponse<ModelVersion[]>(res);
  }

  /**
   * Get model summary by version ID.
   */
  async getModelSummary(versionId: string): Promise<ModelSummary> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/admin/models/${encodeURIComponent(versionId)}/summary`
    );
    return this.handleResponse<ModelSummary>(res);
  }

  /**
   * Evaluate model with optional cell overrides.
   */
  async evaluateModel(
    versionId: string,
    overrides?: Record<string, unknown>
  ): Promise<EvaluationResult> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/admin/models/${encodeURIComponent(versionId)}/evaluate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: overrides ? JSON.stringify({ overrides }) : '{}',
      }
    );
    return this.handleResponse<EvaluationResult>(res);
  }

  /**
   * Set the active model for a company (or default).
   */
  async setActiveModel(versionId: string, companyId?: string): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/admin/models/${encodeURIComponent(versionId)}/set-active`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: companyId ?? 'default' }),
      }
    );
    await this.handleResponse<void>(res, false);
  }

  /**
   * Get the active model version ID for a company (or default).
   */
  async getActiveModel(companyId?: string): Promise<string | null> {
    const cid = companyId ?? 'default';
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/admin/models/active/${encodeURIComponent(cid)}`
    );

    if (!res.ok) {
      await res.text(); // drain body
      if (res.status === 404) return null;
      throw new Error(`Compute Engine error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { version_id?: string; active_version_id?: string };
    const versionId = data.version_id ?? data.active_version_id ?? null;
    return typeof versionId === 'string' ? versionId : null;
  }
}

let cachedClient: ComputeClient | null = null;

/**
 * Get a singleton ComputeClient instance.
 */
export function getComputeClient(config?: Partial<ComputeEngineConfig>): ComputeClient {
  if (!cachedClient) {
    cachedClient = new ComputeClient(config);
  }
  return cachedClient;
}
