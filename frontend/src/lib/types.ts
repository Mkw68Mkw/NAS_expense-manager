export type TransactionType = "income" | "expense";

export interface Category {
  id: number;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  description: string | null;
  transaction_count?: number;
  created_at: string;
  updated_at: string;
}

export type CategoryInput = Pick<Category, "name" | "type" | "color" | "icon" | "description">;

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  type: TransactionType;
  category_id: number;
  category: Pick<Category, "id" | "name" | "color" | "icon"> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionInput {
  date: string;
  description: string;
  amount_cents: number;
  type: TransactionType;
  category_id: number;
  notes: string | null;
}

export interface TransactionFilters {
  search?: string;
  type?: TransactionType;
  category_id?: number;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  sort?: "date" | "amount" | "description" | "category";
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Period {
  from: string;
  to: string;
}

export interface Totals {
  date_from: string;
  date_to: string;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
  savings_rate: number | null;
  transaction_count: number;
  days: number;
  avg_daily_spending_cents: number;
}

export interface Summary extends Totals {
  previous: Totals;
  changes: {
    income_cents: number | null;
    expenses_cents: number | null;
    net_cents: number | null;
    avg_daily_spending_cents: number | null;
    savings_rate: number | null;
  };
  largest_expenses: Transaction[];
}

export interface TimeBucket {
  period: string;
  income_cents: number;
  expenses_cents: number;
  net_cents: number;
}

export interface CategoryReportItem {
  category_id: number;
  name: string;
  color: string;
  icon: string;
  total_cents: number;
  transaction_count: number;
  share: number | null;
}

export interface CategoryReport {
  type: TransactionType;
  total_cents: number;
  items: CategoryReportItem[];
  monthly?: { period: string; values: Record<string, number> }[];
}

export interface CsvImportRow {
  line: number;
  date: string | null;
  description: string | null;
  amount_cents: number | null;
  type: TransactionType | null;
  category: string;
  notes: string | null;
  errors: Record<string, string>;
  duplicate: boolean;
}

export interface CsvImportResult {
  rows: CsvImportRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number; imported: number };
}

export interface Settings {
  currency: string;
  supported_currencies: string[];
}
