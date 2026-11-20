import type {
  Category,
  CategoryInput,
  CategoryReport,
  CsvImportResult,
  PageMeta,
  Period,
  Settings,
  Summary,
  TimeBucket,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionType,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string | number>;

  constructor(status: number, code: string, message: string, details?: Record<string, string | number>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(params: Query): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta?: unknown }> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, "network_error", "Der Server ist nicht erreichbar.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? `Unerwarteter Fehler (${response.status}).`,
      error?.details,
    );
  }
  return body;
}

async function get<T>(path: string): Promise<T> {
  return (await request<T>(path)).data;
}

async function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  return (await request<T>(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) })).data;
}

const periodQuery = (period: Period) => ({ date_from: period.from, date_to: period.to });

export const api = {
  health: () => get<{ status: string }>("/health"),

  listTransactions: async (filters: TransactionFilters) => {
    const result = await request<Transaction[]>(`/transactions${buildQuery({ ...filters })}`);
    return { items: result.data, meta: result.meta as PageMeta };
  },
  createTransaction: (input: TransactionInput) => send<Transaction>("POST", "/transactions", input),
  updateTransaction: (id: number, input: TransactionInput) => send<Transaction>("PUT", `/transactions/${id}`, input),
  deleteTransaction: (id: number) => send<{ deleted: number }>("DELETE", `/transactions/${id}`),
  bulkDeleteTransactions: (ids: number[]) => send<{ deleted: number }>("POST", "/transactions/bulk-delete", { ids }),

  listCategories: () => get<Category[]>("/categories"),
  createCategory: (input: CategoryInput) => send<Category>("POST", "/categories", input),
  updateCategory: (id: number, input: CategoryInput) => send<Category>("PUT", `/categories/${id}`, input),
  deleteCategory: (id: number, reassignTo?: number) =>
    send<{ deleted: number; reassigned: number }>("DELETE", `/categories/${id}${buildQuery({ reassign_to: reassignTo })}`),

  summary: (period: Period, largestLimit = 5) =>
    get<Summary>(`/reports/summary${buildQuery({ ...periodQuery(period), largest_limit: largestLimit })}`),
  timeline: (period: Period, granularity: "day" | "month") =>
    get<TimeBucket[]>(`/reports/monthly${buildQuery({ ...periodQuery(period), granularity })}`),
  categoryReport: (period: Period, type: TransactionType, includeMonthly = false) =>
    get<CategoryReport>(
      `/reports/categories${buildQuery({ ...periodQuery(period), type, include_monthly: includeMonthly ? 1 : undefined })}`,
    ),

  importCsv: async (file: File, mode: "preview" | "commit") => {
    const form = new FormData();
    form.append("file", file);
    return (await request<CsvImportResult>(`/import/csv?mode=${mode}`, { method: "POST", body: form })).data;
  },
  csvExportUrl: (filters: TransactionFilters) => {
    const { page: _page, page_size: _size, ...rest } = filters;
    return `/api/export/csv${buildQuery({ ...rest })}`;
  },

  backupUrl: "/api/backup",
  restore: (backup: unknown) => send<{ categories: number; transactions: number }>("POST", "/restore", backup),
  deleteAllData: () => send<{ reset: boolean }>("DELETE", "/data?confirm=true"),
  loadDemoData: () => send<{ created: number }>("POST", "/demo"),

  getSettings: () => get<Settings>("/settings"),
  updateSettings: (settings: Pick<Settings, "currency">) => send<Settings>("PUT", "/settings", settings),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Ein unerwarteter Fehler ist aufgetreten.";
}
