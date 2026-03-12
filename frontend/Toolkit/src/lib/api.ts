import { queryClient } from "./queryClient";
import { API_BASE } from "./config";

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: "include", 
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(data.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // --- Authentication ---
  login: (email: string, password: string) =>
    apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  logout: () =>
    apiRequest("/api/auth/logout", { method: "POST" }),

  getMe: () =>
    apiRequest("/api/auth/me"),

  // --- Clients ---
  getClients: () => apiRequest("/api/clients"),
  createClient: (data: any) => apiRequest("/api/clients", { method: "POST", body: JSON.stringify(data) }),
  getClient: (id: string) => apiRequest(`/api/clients/${id}`),
  updateClient: (id: string, data: any) => apiRequest(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteClient: (id: string) => apiRequest(`/api/clients/${id}`, { method: "DELETE" }),
  uploadClientLogo: async (clientId: string, file: File) => {
    const form = new FormData();
    form.append("logo", file);
    const res = await fetch(`${API_BASE}/api/clients/${clientId}/logo`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(d.message);
    }
    return res.json();
  },
  getClientData: (id: string) => apiRequest(`/api/clients/${id}/data`),

  // --- Shareholders ---
  addShareholder: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/shareholders`, { method: "POST", body: JSON.stringify(data) }),
  updateShareholder: (id: string, data: any) =>
    apiRequest(`/api/shareholders/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteShareholder: (id: string) =>
    apiRequest(`/api/shareholders/${id}`, { method: "DELETE" }),
  updateOwnership: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/ownership`, { method: "PATCH", body: JSON.stringify(data) }),

  // --- Employees ---
  addEmployee: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/employees`, { method: "POST", body: JSON.stringify(data) }),
  bulkAddEmployees: (clientId: string, data: any[]) =>
    apiRequest(`/api/clients/${clientId}/employees/bulk`, { method: "POST", body: JSON.stringify({ employees: data }) }),
  deleteEmployee: (id: string) => apiRequest(`/api/employees/${id}`, { method: "DELETE" }),

  // --- Training Programs ---
  addTrainingProgram: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/training-programs`, { method: "POST", body: JSON.stringify(data) }),
  updateTrainingProgram: (id: string, data: any) =>
    apiRequest(`/api/training-programs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTrainingProgram: (id: string) =>
    apiRequest(`/api/training-programs/${id}`, { method: "DELETE" }),

  // --- Suppliers & Procurement ---
  addSupplier: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/suppliers`, { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: any) =>
    apiRequest(`/api/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSupplier: (id: string) => apiRequest(`/api/suppliers/${id}`, { method: "DELETE" }),
  updateProcurement: (clientId: string, tmps: number) =>
    apiRequest(`/api/clients/${clientId}/procurement`, { method: "PATCH", body: JSON.stringify({ tmps }) }),

  // --- ESD & SED Contributions ---
  addEsdContribution: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/esd-contributions`, { method: "POST", body: JSON.stringify(data) }),
  deleteEsdContribution: (id: string) =>
    apiRequest(`/api/esd-contributions/${id}`, { method: "DELETE" }),

  addSedContribution: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/sed-contributions`, { method: "POST", body: JSON.stringify(data) }),
  deleteSedContribution: (id: string) =>
    apiRequest(`/api/sed-contributions/${id}`, { method: "DELETE" }),

  // --- Scenarios ---
  addScenario: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/scenarios`, { method: "POST", body: JSON.stringify(data) }),
  deleteScenario: (id: string) => apiRequest(`/api/scenarios/${id}`, { method: "DELETE" }),

  // --- Financial Years ---
  addFinancialYear: (clientId: string, data: any) =>
    apiRequest(`/api/clients/${clientId}/financial-years`, { method: "POST", body: JSON.stringify(data) }),
  deleteFinancialYear: (id: string) =>
    apiRequest(`/api/financial-years/${id}`, { method: "DELETE" }),

  // --- Export Logs ---
  logExport: (data: any) => apiRequest("/api/export-log", { method: "POST", body: JSON.stringify(data) }),
  getExportLogs: (clientId: string) => apiRequest(`/api/clients/${clientId}/export-logs`),

  // --- Calculator Config ---
  getCalculatorConfig: (clientId: string) => apiRequest(`/api/clients/${clientId}/calculator-config`),
  saveCalculatorConfig: (clientId: string, config: any) =>
    apiRequest(`/api/clients/${clientId}/calculator-config`, { method: "PUT", body: JSON.stringify({ config }) }),
  generateCalculatorSuggestions: (context: { type: string; industry?: string; existing?: any[] }) =>
    apiRequest("/api/generate-calculator-suggestions", { method: "POST", body: JSON.stringify(context) }),
};

// Invalidate cached client data
export function invalidateClientData(clientId: string) {
  queryClient.invalidateQueries({ queryKey: ["client-data", clientId] });
}