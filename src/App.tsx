import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Filler,
  ArcElement,
  Legend,
} from 'chart.js';
import { Line, Pie as PieChart } from 'react-chartjs-2';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CreditCard,
  Download,
  Filter,
  Import,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tooltip } from '@/components/ui/tooltip';
import { Popover } from '@/components/ui/popover';
import { ThemeToggle } from '@/components/ThemeToggle';
import { MetricInfo } from '@/components/MetricInfo';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Filler, ArcElement, Legend);

type TxType = 'expense' | 'income';

type Transaction = {
  id: string;
  date: string; // ISO yyyy-mm-dd
  merchant: string;
  amountCents: number; // positive in cents
  type: TxType;
  categoryId: string;
  accountId: string;
  note?: string;
};

type Category = {
  id: string;
  name: string;
  emoji?: string;
  monthlyBudgetCents?: number; // optional
};

type Account = {
  id: string;
  name: string;
  type: 'chequing' | 'credit' | 'savings';
};

type Rule = {
  id: string;
  contains: string;
  categoryId: string;
};

type AppState = {
  version: 1;
  categories: Category[];
  accounts: Account[];
  rules: Rule[];
  transactions: Transaction[];
  settings: {
    currency: 'CAD' | 'USD';
    hideCents: boolean;
    smartCategorize: boolean;
  };
};

const STORAGE_KEY = 'finsight_v2_state';
const THEME_KEY = 'budgetboard_theme';
type ThemeMode = 'light' | 'dark';

const CATEGORY_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#0f766e',
];

function hashToIndex(input: string, mod: number) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

function categoryColour(categoryId: string) {
  return CATEGORY_PALETTE[hashToIndex(categoryId, CATEGORY_PALETTE.length)];
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartISO(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function previousDateRange(range: { min: string; max: string }) {
  const minDate = new Date(`${range.min}T00:00:00`);
  const maxDate = new Date(`${range.max}T00:00:00`);
  const dayDiff = Math.max(0, Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))) + 1;

  const prevMax = new Date(minDate);
  prevMax.setDate(prevMax.getDate() - 1);
  const prevMin = new Date(prevMax);
  prevMin.setDate(prevMin.getDate() - (dayDiff - 1));

  const yyyy = (d: Date) => d.getFullYear();
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0');
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0');

  return { min: `${yyyy(prevMin)}-${mm(prevMin)}-${dd(prevMin)}`, max: `${yyyy(prevMax)}-${mm(prevMax)}-${dd(prevMax)}` };
}

function formatMoney(cents: number, currency: 'CAD' | 'USD', hideCents: boolean) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const value = hideCents ? Math.round(abs / 100) : abs / 100;
  return (
    sign +
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: hideCents ? 0 : 2,
      minimumFractionDigits: hideCents ? 0 : 2,
    }).format(value)
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseMoneyToCents(input: string) {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const val = Number(cleaned);
  if (Number.isNaN(val)) return 0;
  return Math.round(val * 100);
}

function dateInRange(dateISO: string, minISO: string, maxISO: string) {
  return dateISO >= minISO && dateISO <= maxISO;
}

function safeLower(s: string) {
  return (s || '').toLowerCase();
}

function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyThemeClass(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

function formatDeltaCurrency(cents: number, currency: 'CAD' | 'USD', hideCents: boolean) {
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(cents), currency, hideCents)}`;
}

function cssHsl(varName: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
  if (!raw) return fallback;
  return `hsl(${raw.trim()})`;
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('hsl')) return color.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
  return color;
}

const defaultState: AppState = {
  version: 1,
  accounts: [
    { id: 'acc_cheq', name: 'Chequing', type: 'chequing' },
    { id: 'acc_cc', name: 'Credit Card', type: 'credit' },
    { id: 'acc_save', name: 'Savings', type: 'savings' },
  ],
  categories: [
    { id: 'cat_gro', name: 'Groceries', emoji: '🛒', monthlyBudgetCents: 60000 },
    { id: 'cat_rent', name: 'Rent', emoji: '🏠', monthlyBudgetCents: 180000 },
    { id: 'cat_eat', name: 'Eating Out', emoji: '🍜', monthlyBudgetCents: 30000 },
    { id: 'cat_trans', name: 'Transport', emoji: '🚇', monthlyBudgetCents: 20000 },
    { id: 'cat_subs', name: 'Subscriptions', emoji: '📺', monthlyBudgetCents: 15000 },
    { id: 'cat_health', name: 'Health', emoji: '💊', monthlyBudgetCents: 15000 },
    { id: 'cat_other', name: 'Other', emoji: '🧾', monthlyBudgetCents: 25000 },
    { id: 'cat_income', name: 'Income', emoji: '💰' },
  ],
  rules: [
    { id: 'r1', contains: 'uber', categoryId: 'cat_trans' },
    { id: 'r2', contains: 'loblaws', categoryId: 'cat_gro' },
    { id: 'r3', contains: 'spotify', categoryId: 'cat_subs' },
  ],
  transactions: [
    {
      id: 't1',
      date: addDaysISO(todayISO(), -2),
      merchant: 'Loblaws',
      amountCents: 8423,
      type: 'expense',
      categoryId: 'cat_gro',
      accountId: 'acc_cc',
      note: 'Weekly groceries',
    },
    {
      id: 't2',
      date: addDaysISO(todayISO(), -4),
      merchant: 'Spotify',
      amountCents: 1199,
      type: 'expense',
      categoryId: 'cat_subs',
      accountId: 'acc_cc',
    },
    {
      id: 't3',
      date: addDaysISO(todayISO(), -6),
      merchant: 'Ramen',
      amountCents: 2487,
      type: 'expense',
      categoryId: 'cat_eat',
      accountId: 'acc_cc',
    },
    {
      id: 't4',
      date: addDaysISO(todayISO(), -10),
      merchant: 'Paycheque',
      amountCents: 240000,
      type: 'income',
      categoryId: 'cat_income',
      accountId: 'acc_cheq',
    },
    {
      id: 't5',
      date: monthStartISO(todayISO()),
      merchant: 'Rent',
      amountCents: 180000,
      type: 'expense',
      categoryId: 'cat_rent',
      accountId: 'acc_cheq',
    },
    {
      id: 't6',
      date: '2025-09-08',
      merchant: 'Farmers Market',
      amountCents: 5600,
      type: 'expense',
      categoryId: 'cat_gro',
      accountId: 'acc_cc',
    },
    {
      id: 't7',
      date: '2025-09-15',
      merchant: 'Commuter Pass',
      amountCents: 12000,
      type: 'expense',
      categoryId: 'cat_trans',
      accountId: 'acc_cc',
    },
    {
      id: 't8',
      date: '2025-09-30',
      merchant: 'Paycheque',
      amountCents: 240000,
      type: 'income',
      categoryId: 'cat_income',
      accountId: 'acc_cheq',
    },
    {
      id: 't9',
      date: '2025-10-10',
      merchant: 'Dentist',
      amountCents: 32000,
      type: 'expense',
      categoryId: 'cat_health',
      accountId: 'acc_cheq',
    },
    {
      id: 't10',
      date: '2025-10-22',
      merchant: 'Meal Prep',
      amountCents: 18500,
      type: 'expense',
      categoryId: 'cat_gro',
      accountId: 'acc_cc',
    },
    {
      id: 't11',
      date: '2025-10-31',
      merchant: 'Paycheque',
      amountCents: 240000,
      type: 'income',
      categoryId: 'cat_income',
      accountId: 'acc_cheq',
    },
    {
      id: 't12',
      date: '2025-11-05',
      merchant: 'Holiday Flights',
      amountCents: 65000,
      type: 'expense',
      categoryId: 'cat_other',
      accountId: 'acc_cc',
      note: 'Family travel',
    },
    {
      id: 't13',
      date: '2025-11-18',
      merchant: 'Grocery Stock-up',
      amountCents: 42000,
      type: 'expense',
      categoryId: 'cat_gro',
      accountId: 'acc_cc',
    },
    {
      id: 't14',
      date: '2025-11-28',
      merchant: 'Black Friday Electronics',
      amountCents: 98000,
      type: 'expense',
      categoryId: 'cat_other',
      accountId: 'acc_cc',
    },
    {
      id: 't15',
      date: '2025-11-30',
      merchant: 'Paycheque',
      amountCents: 240000,
      type: 'income',
      categoryId: 'cat_income',
      accountId: 'acc_cheq',
    },
    {
      id: 't16',
      date: '2025-12-03',
      merchant: 'Gifts & Decor',
      amountCents: 75000,
      type: 'expense',
      categoryId: 'cat_other',
      accountId: 'acc_cc',
    },
    {
      id: 't17',
      date: '2025-12-12',
      merchant: 'Dining Out',
      amountCents: 28000,
      type: 'expense',
      categoryId: 'cat_eat',
      accountId: 'acc_cc',
    },
    {
      id: 't18',
      date: '2025-12-20',
      merchant: 'Charity Donation',
      amountCents: 30000,
      type: 'expense',
      categoryId: 'cat_other',
      accountId: 'acc_cheq',
    },
    {
      id: 't19',
      date: '2025-12-31',
      merchant: 'Paycheque',
      amountCents: 240000,
      type: 'income',
      categoryId: 'cat_income',
      accountId: 'acc_cheq',
    },
  ],
  settings: {
    currency: 'CAD',
    hideCents: false,
    smartCategorize: true,
  },
};

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== 1) return defaultState;
    return parsed;
  } catch {
    return defaultState;
  }
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

type DatePreset = 'this_month' | 'last_month' | 'last_90' | 'all';

function dateRangeForPreset(preset: DatePreset) {
  const today = todayISO();
  if (preset === 'all') return { min: '1900-01-01', max: '2999-12-31' };

  if (preset === 'this_month') {
    const min = monthStartISO(today);
    return { min, max: today };
  }

  if (preset === 'last_90') {
    return { min: addDaysISO(today, -89), max: today };
  }

  const d = new Date(`${today}T00:00:00`);
  d.setMonth(d.getMonth() - 1);
  const lastMonthISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const min = lastMonthISO;
  const end = new Date(`${min}T00:00:00`);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  const max = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { min, max };
}

function groupByDayNet(transactions: Transaction[]) {
  const map = new Map<
    string,
    { date: string; netCents: number; incomeCents: number; expenseCents: number }
  >();
  for (const t of transactions) {
    const key = t.date;
    const existing =
      map.get(key) || { date: key, netCents: 0, incomeCents: 0, expenseCents: 0 };
    if (t.type === 'income') {
      existing.incomeCents += t.amountCents;
      existing.netCents += t.amountCents;
    } else {
      existing.expenseCents += t.amountCents;
      existing.netCents -= t.amountCents;
    }
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function groupExpenseByCategory(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amountCents);
  }
  return map;
}

function csvEscape(value: string) {
  const s = value ?? '';
  if (/[\n\r,"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCSV(state: AppState) {
  const header = ['date', 'merchant', 'amount', 'type', 'category', 'account', 'note'];
  const catById = new Map(state.categories.map((c) => [c.id, c.name] as const));
  const accById = new Map(state.accounts.map((a) => [a.id, a.name] as const));
  const rows = state.transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((t) => [
      t.date,
      t.merchant,
      (t.amountCents / 100).toFixed(2),
      t.type,
      catById.get(t.categoryId) || '',
      accById.get(t.accountId) || '',
      t.note || '',
    ]);

  const csv = [header, ...rows]
    .map((r) => r.map((v) => csvEscape(String(v))).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSVText(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cur.replace(/\r/g, ''));
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }

  row.push(cur.replace(/\r/g, ''));
  rows.push(row);

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));
}

function applySmartCategory(merchant: string, rules: Rule[], fallbackCategoryId: string) {
  const m = safeLower(merchant);
  for (const r of rules) {
    if (!r.contains.trim()) continue;
    if (m.includes(safeLower(r.contains))) return r.categoryId;
  }
  return fallbackCategoryId;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : clamp(Math.round((value / max) * 100), 0, 120);
  const tone = pct <= 80 ? 'bg-emerald-500' : pct <= 100 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-muted">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{pct}%</span>
        <span>{pct > 100 ? 'Over' : 'Remaining'}</span>
      </div>
    </div>
  );
}

function StatCard(props: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  info?: { definition: string; formula: string };
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{props.title}</CardTitle>
          {props.info ? (
            <MetricInfo title={props.title} definition={props.info.definition} formula={props.info.formula} />
          ) : null}
        </div>
        <div className="text-muted-foreground">{props.icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{props.value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{props.subtitle}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState(props: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium">{props.title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{props.detail}</div>
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export default function FinanceDashboardV2() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState('overview');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return getInitialTheme();
    } catch {
      return 'light';
    }
  });
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [txDate, setTxDate] = useState(todayISO());
  const [txMerchant, setTxMerchant] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<TxType>('expense');
  const [txCategoryId, setTxCategoryId] = useState('cat_other');
  const [txAccountId, setTxAccountId] = useState('acc_cc');
  const [txNote, setTxNote] = useState('');
  const [importText, setImportText] = useState('');
  const importRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const handler = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY)) return;
      setTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!state.settings.smartCategorize) return;
    if (!txMerchant.trim()) return;
    if (txType !== 'expense') return;
    const suggested = applySmartCategory(txMerchant, state.rules, 'cat_other');
    setTxCategoryId(suggested);
  }, [txMerchant, txType, state.rules, state.settings.smartCategorize]);

  const currency = state.settings.currency;
  const hideCents = state.settings.hideCents;
  const themeColors = useMemo(
    () => ({
      text: cssHsl('--foreground', '#0f172a'),
      muted: cssHsl('--muted-foreground', '#9ca3af'),
      border: cssHsl('--border', '#e5e7eb'),
      primary: cssHsl('--primary', '#2563eb'),
      accent: cssHsl('--accent', '#e5e7eb'),
      card: cssHsl('--card', '#ffffff'),
    }),
    [theme]
  );
  const range = useMemo(() => dateRangeForPreset(datePreset), [datePreset]);
  const previousRangeWindow = useMemo(() => previousDateRange(range), [range.min, range.max]);

  const filteredTx = useMemo(() => {
    const s = safeLower(search);
    return state.transactions
      .filter((t) => dateInRange(t.date, range.min, range.max))
      .filter((t) => (accountFilter === 'all' ? true : t.accountId === accountFilter))
      .filter((t) => {
        if (!s) return true;
        return (
          safeLower(t.merchant).includes(s) ||
          safeLower(t.note || '').includes(s) ||
          safeLower(categoryName(state.categories, t.categoryId)).includes(s)
        );
      })
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [state.transactions, range.min, range.max, accountFilter, search, state.categories]);

  const previousRangeTx = useMemo(
    () =>
      state.transactions
        .filter((t) => dateInRange(t.date, previousRangeWindow.min, previousRangeWindow.max))
        .filter((t) => (accountFilter === 'all' ? true : t.accountId === accountFilter)),
    [state.transactions, previousRangeWindow.min, previousRangeWindow.max, accountFilter]
  );

  const categoryStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { txCount: number; totalCents: number; merchants: Map<string, { count: number; totalCents: number }> }
    >();

    for (const t of filteredTx) {
      const entry = map.get(t.categoryId) || { txCount: 0, totalCents: 0, merchants: new Map() };
      entry.txCount += 1;
      if (t.type === 'expense') entry.totalCents += t.amountCents;
      const merchantEntry = entry.merchants.get(t.merchant) || { count: 0, totalCents: 0 };
      merchantEntry.count += 1;
      if (t.type === 'expense') merchantEntry.totalCents += t.amountCents;
      entry.merchants.set(t.merchant, merchantEntry);
      map.set(t.categoryId, entry);
    }

    return map;
  }, [filteredTx]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of filteredTx) {
      if (t.type === 'income') income += t.amountCents;
      else expense += t.amountCents;
    }
    const net = income - expense;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    return { income, expense, net, savingsRate };
  }, [filteredTx]);

  const previousTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of previousRangeTx) {
      if (t.type === 'income') income += t.amountCents;
      else expense += t.amountCents;
    }
    const net = income - expense;
    const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
    return { income, expense, net, savingsRate };
  }, [previousRangeTx]);

  const budgetStats = useMemo(() => {
    const budgets = state.categories
      .filter((c) => (c.monthlyBudgetCents || 0) > 0)
      .map((c) => ({ id: c.id, budgetCents: c.monthlyBudgetCents || 0 }));

    const spentByCat = groupExpenseByCategory(
      state.transactions.filter((t) => dateInRange(t.date, range.min, range.max))
    );

    const rows = budgets
      .map((b) => {
        const spent = spentByCat.get(b.id) || 0;
        const remaining = b.budgetCents - spent;
        return {
          categoryId: b.id,
          budgetCents: b.budgetCents,
          spentCents: spent,
          remainingCents: remaining,
        };
      })
      .sort((a, b) => b.spentCents - a.spentCents);

    const totalBudget = rows.reduce((sum, r) => sum + r.budgetCents, 0);
    const totalSpent = rows.reduce((sum, r) => sum + r.spentCents, 0);

    return { rows, totalBudget, totalSpent, remaining: totalBudget - totalSpent };
  }, [state.categories, state.transactions, range.min, range.max]);

  const categoryPie = useMemo(() => {
    const spentByCat = groupExpenseByCategory(filteredTx);
    const rows = Array.from(spentByCat.entries())
      .map(([categoryId, spentCents]) => ({
        categoryId,
        name: categoryLabel(state.categories, categoryId),
        value: spentCents,
      }))
      .sort((a, b) => b.value - a.value);

    return rows.slice(0, 8);
  }, [filteredTx, state.categories]);
  const previousCategoryTotals = useMemo(() => groupExpenseByCategory(previousRangeTx), [previousRangeTx]);

  const cashflow = useMemo(() => {
    const daily = groupByDayNet(filteredTx.slice().reverse());
    let running = 0;
    return daily.map((d) => {
      running += d.netCents;
      return {
        date: d.date.slice(5),
        runningCents: running,
        incomeCents: d.incomeCents,
        expenseCents: d.expenseCents,
      };
    });
  }, [filteredTx]);

  const safeToSpend = useMemo(() => {
    const today = todayISO();
    const min = monthStartISO(today);
    const monthTx = state.transactions.filter((t) => dateInRange(t.date, min, today));

    let income = 0;
    let expense = 0;
    for (const t of monthTx) {
      if (t.type === 'income') income += t.amountCents;
      else expense += t.amountCents;
    }

    const totalBudget = state.categories.reduce((sum, c) => sum + (c.monthlyBudgetCents || 0), 0);
    const budgetRemaining = totalBudget - expense;
    const currentNet = income - expense;

    const hasBudgets = totalBudget > 0;
    const value = hasBudgets ? budgetRemaining : currentNet;
    const label = hasBudgets ? 'Based on budgets' : 'Based on net';

    return { value, label };
  }, [state.transactions, state.categories]);
  const categoryHoverDetail = useCallback(
    (categoryId: string) => {
      const entry = categoryStatsMap.get(categoryId);
      if (!entry) return { txCount: 0, merchants: [] as { name: string; count: number; totalCents: number }[] };
      const merchants = Array.from(entry.merchants.entries())
        .map(([name, data]) => ({ name, count: data.count, totalCents: data.totalCents }))
        .sort((a, b) => b.totalCents - a.totalCents)
        .slice(0, 3);
      return { txCount: entry.txCount, merchants };
    },
    [categoryStatsMap]
  );

  const cashflowChart = useMemo(() => {
    const labels = cashflow.map((d) => d.date);
    const dataValues = cashflow.map((d) => d.runningCents / 100);
    const finalCents = cashflow.length ? cashflow[cashflow.length - 1].runningCents : 0;

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Net',
            data: dataValues,
            borderColor: themeColors.primary,
            backgroundColor: withAlpha(themeColors.primary, 0.15),
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                formatMoney(Math.round(Number(ctx.parsed.y) * 100), currency, hideCents),
              afterBody: (items) => {
                if (!items.length) return [];
                const item = items[0];
                const currentCents = Math.round(Number(item.raw) * 100);
                const prevValue = item.dataIndex > 0 ? Math.round(Number(dataValues[item.dataIndex - 1]) * 100) : currentCents;
                const delta = currentCents - prevValue;
                const share = finalCents !== 0 ? formatPercent((currentCents / finalCents) * 100) : '0%';
                const prevPeriodDelta = formatDeltaCurrency(currentCents - previousTotals.net, currency, hideCents);
                return [
                  `Δ prev point: ${formatDeltaCurrency(delta, currency, hideCents)}`,
                  `Share of final: ${share}`,
                  `Δ vs prev period: ${prevPeriodDelta}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: themeColors.muted, maxRotation: 0 },
          },
          y: {
            grid: { color: withAlpha(themeColors.muted, 0.25) },
            ticks: {
              color: themeColors.muted,
              callback: (v: any) => (hideCents ? `${Math.round(Number(v))}` : `${v}`),
            },
          },
        },
      },
    };
  }, [cashflow, currency, hideCents, themeColors, previousTotals.net]);

  const categoryPieChart = useMemo(() => {
    const labels = categoryPie.map((c) => c.name);
    const values = categoryPie.map((c) => c.value / 100);
    const colors = categoryPie.map((c) => categoryColour(c.categoryId));
    const total = values.reduce((sum, v) => sum + v, 0);

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const raw = Number(ctx.raw);
                const cents = Math.round(raw * 100);
                const percent = total > 0 ? formatPercent((raw / total) * 100) : '0%';
                const categoryId = categoryPie[ctx.dataIndex]?.categoryId;
                const prev = categoryId ? previousCategoryTotals.get(categoryId) || 0 : 0;
                const delta = formatDeltaCurrency(cents - prev, currency, hideCents);
                return `${ctx.label}: ${formatMoney(cents, currency, hideCents)} (${percent}, Δ ${delta})`;
              },
            },
          },
        },
      },
    };
  }, [categoryPie, currency, hideCents, previousCategoryTotals]);

  function resetState() {
    setState(defaultState);
  }

  function addTransaction() {
    const amountCents = Math.abs(parseMoneyToCents(txAmount));
    if (!txMerchant.trim()) return;
    if (amountCents <= 0) return;

    const newTx: Transaction = {
      id: uid('tx'),
      date: txDate,
      merchant: txMerchant.trim(),
      amountCents,
      type: txType,
      categoryId: txType === 'income' ? 'cat_income' : txCategoryId,
      accountId: txAccountId,
      note: txNote.trim() || undefined,
    };

    setState((prev) => ({ ...prev, transactions: [newTx, ...prev.transactions] }));

    setTxDate(todayISO());
    setTxMerchant('');
    setTxAmount('');
    setTxType('expense');
    setTxCategoryId('cat_other');
    setTxAccountId('acc_cc');
    setTxNote('');
    setTxModalOpen(false);
  }

  function deleteTransaction(id: string) {
    setState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  }

  function upsertCategoryBudget(categoryId: string, monthlyBudgetCents: number) {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === categoryId ? { ...c, monthlyBudgetCents } : c)),
    }));
  }

  function addRule(contains: string, categoryId: string) {
    const trimmed = contains.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      rules: [{ id: uid('rule'), contains: trimmed, categoryId }, ...prev.rules],
    }));
  }

  function deleteRule(id: string) {
    setState((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== id),
    }));
  }

  function importFromText() {
    const rows = parseCSVText(importText);
    if (rows.length < 2) return;

    const header = rows[0].map((h) => safeLower(h));
    const idx = (name: string) => header.indexOf(name);

    const dateIdx = idx('date');
    const merchantIdx = idx('merchant');
    const amountIdx = idx('amount');
    const typeIdx = idx('type');
    const categoryIdx = idx('category');
    const accountIdx = idx('account');
    const noteIdx = idx('note');

    if (dateIdx === -1 || merchantIdx === -1 || amountIdx === -1) return;

    const catByName = new Map(state.categories.map((c) => [safeLower(c.name), c.id] as const));
    const accByName = new Map(state.accounts.map((a) => [safeLower(a.name), a.id] as const));

    const next: Transaction[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const date = (r[dateIdx] || '').slice(0, 10);
      const merchant = r[merchantIdx] || '';
      const amount = r[amountIdx] || '';
      const type = (r[typeIdx] as TxType) || 'expense';
      const categoryNameVal = categoryIdx >= 0 ? r[categoryIdx] : '';
      const accountNameVal = accountIdx >= 0 ? r[accountIdx] : '';
      const note = noteIdx >= 0 ? r[noteIdx] : '';

      if (!date || !merchant || !amount) continue;

      const amountCents = Math.abs(parseMoneyToCents(amount));
      if (amountCents <= 0) continue;

      const resolvedAccountId = accByName.get(safeLower(accountNameVal)) || 'acc_cc';
      let resolvedCategoryId = 'cat_other';

      if (type === 'income') {
        resolvedCategoryId = 'cat_income';
      } else if (categoryNameVal) {
        resolvedCategoryId = catByName.get(safeLower(categoryNameVal)) || 'cat_other';
      } else if (state.settings.smartCategorize) {
        resolvedCategoryId = applySmartCategory(merchant, state.rules, 'cat_other');
      }

      next.push({
        id: uid('tx'),
        date,
        merchant,
        amountCents,
        type: type === 'income' ? 'income' : 'expense',
        categoryId: resolvedCategoryId,
        accountId: resolvedAccountId,
        note: note || undefined,
      });
    }

    if (next.length === 0) return;
    setState((prev) => ({ ...prev, transactions: [...next, ...prev.transactions] }));
    setImportText('');
    setImportOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <Header
          state={state}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          accountFilter={accountFilter}
          setAccountFilter={setAccountFilter}
          search={search}
          setSearch={setSearch}
          onAddTx={() => setTxModalOpen(true)}
          onExport={() => exportCSV(state)}
          onImport={() => setImportOpen(true)}
          theme={theme}
          onThemeChange={setTheme}
        />

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl sm:grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="budgets">Budgets</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <StatCard
                title="Income"
                value={formatMoney(totals.income, currency, hideCents)}
                subtitle="In selected range"
                icon={<ArrowUp className="h-4 w-4" />}
                info={{ definition: 'Total income in the selected date range and filters.', formula: 'Sum of income transaction amounts.' }}
              />
              <StatCard
                title="Spending"
                value={formatMoney(totals.expense, currency, hideCents)}
                subtitle="In selected range"
                icon={<ArrowDown className="h-4 w-4" />}
                info={{ definition: 'Total expenses in the selected date range and filters.', formula: 'Sum of expense transaction amounts.' }}
              />
              <StatCard
                title="Net"
                value={formatMoney(totals.net, currency, hideCents)}
                subtitle={`Savings rate: ${totals.savingsRate}%`}
                icon={<Wallet className="h-4 w-4" />}
                info={{ definition: 'Income minus spending for the selected range.', formula: 'Net = Income - Spending.' }}
              />
              <StatCard
                title="Safe to spend"
                value={formatMoney(safeToSpend.value, currency, hideCents)}
                subtitle={safeToSpend.label}
                icon={<Target className="h-4 w-4" />}
                info={{
                  definition: 'Projected available funds after budgets or current net.',
                  formula: 'Uses budget remaining if budgets exist; otherwise net income minus expenses.',
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">Cashflow</CardTitle>
                      <MetricInfo
                        title="Cashflow"
                        definition="Inflow minus outflow over the selected date range."
                        formula="Net cashflow = Income - Expenses in range."
                      />
                    </div>
                    <Tooltip
                      content={
                        <div className="space-y-1">
                          <div className="text-xs font-semibold">Range summary</div>
                          <div className="text-xs text-muted-foreground">
                            Inflow: {formatMoney(totals.income, currency, hideCents)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Outflow: {formatMoney(totals.expense, currency, hideCents)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Net: {formatMoney(totals.net, currency, hideCents)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            MoM: {formatDeltaCurrency(totals.net - previousTotals.net, currency, hideCents)}
                          </div>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-xl border border-border/60 px-2 text-xs text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <Info className="h-4 w-4" />
                        <span>Hover for details</span>
                      </button>
                    </Tooltip>
                  </div>
                </CardHeader>
                <CardContent className="h-[220px] sm:h-[260px] lg:h-[320px]">
                  {cashflow.length === 0 ? (
                    <EmptyState
                      title="No data yet"
                      detail="Add a few transactions to see trends."
                      action={
                        <Button onClick={() => setTxModalOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Add transaction
                        </Button>
                      }
                    />
                  ) : (
                    <Line data={cashflowChart.data} options={cashflowChart.options as any} />
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Spending by category</CardTitle>
                </CardHeader>
                <CardContent className="h-[220px] sm:h-[260px] lg:h-[320px]">
                  {categoryPie.length === 0 ? (
                    <EmptyState title="No spending yet" detail="Expenses will show here." />
                  ) : (
                    <div className="grid h-full grid-cols-2 gap-2">
                      <div className="h-full">
                        <PieChart data={categoryPieChart.data} options={categoryPieChart.options as any} />
                      </div>

                      <div className="flex flex-col justify-center gap-2">
                        {categoryPie.slice(0, 6).map((c) => (
                          <div key={c.categoryId} className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2 text-sm">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: categoryColour(c.categoryId) }}
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  <CategoryHover
                                    label={c.name}
                                    stats={categoryHoverDetail(c.categoryId)}
                                    currency={currency}
                                    hideCents={hideCents}
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground">{rangeLabel(datePreset)}</div>
                              </div>
                            </div>
                            <div className="text-sm font-medium">{formatMoney(c.value, currency, hideCents)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Budget health</CardTitle>
                </CardHeader>
                <CardContent>
                  {budgetStats.rows.length === 0 ? (
                    <EmptyState title="No budgets set" detail="Add budgets for categories to track progress." />
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-sm text-muted-foreground">Total budget</div>
                          <div className="text-xl font-semibold">
                            {formatMoney(budgetStats.totalBudget, currency, hideCents)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Spent</div>
                          <div className="text-xl font-semibold">
                            {formatMoney(budgetStats.totalSpent, currency, hideCents)}
                          </div>
                        </div>
                      </div>

                      <ProgressBar value={budgetStats.totalSpent} max={budgetStats.totalBudget} />

                      <Separator />

                      <div className="space-y-3">
                        {budgetStats.rows.slice(0, 6).map((r) => (
                          <div key={r.categoryId} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium">
                                {categoryLabel(state.categories, r.categoryId)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatMoney(r.spentCents, currency, hideCents)} /{' '}
                                {formatMoney(r.budgetCents, currency, hideCents)}
                              </div>
                            </div>
                            <ProgressBar value={r.spentCents} max={r.budgetCents} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {filteredTx.length === 0 ? (
                    <EmptyState
                      title="Nothing here"
                      detail="Try changing the date range or add a transaction."
                      action={
                        <Button onClick={() => setTxModalOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Add transaction
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredTx.slice(0, 6).map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.merchant}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.date} · {categoryLabel(state.categories, t.categoryId)} ·{' '}
                              {accountName(state.accounts, t.accountId)}
                            </div>
                          </div>
                          <div className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-500' : ''}`}>
                            {t.type === 'income' ? '+' : '-'}
                            {formatMoney(t.amountCents, currency, hideCents)}
                          </div>
                        </div>
                      ))}
                      <div className="pt-2">
                        <Button variant="secondary" className="w-full" onClick={() => setTab('transactions')}>
                          View all
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="mt-6">
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Transactions</CardTitle>
                <Button onClick={() => setTxModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </CardHeader>
              <CardContent>
                {filteredTx.length === 0 ? (
                  <EmptyState
                    title="No transactions"
                    detail="Add a transaction, or import CSV."
                    action={
                      <div className="flex gap-2">
                        <Button onClick={() => setTxModalOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Add
                        </Button>
                        <Button variant="secondary" onClick={() => setImportOpen(true)}>
                          <Import className="mr-2 h-4 w-4" /> Import
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Merchant</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTx.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                            <TableCell className="max-w-[260px] truncate">{t.merchant}</TableCell>
                            <TableCell>{categoryLabel(state.categories, t.categoryId)}</TableCell>
                            <TableCell>{accountName(state.accounts, t.accountId)}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${t.type === 'income' ? 'text-emerald-500' : ''}`}
                            >
                              {t.type === 'income' ? '+' : '-'}
                              {formatMoney(t.amountCents, currency, hideCents)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" onClick={() => deleteTransaction(t.id)}>
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="budgets" className="mt-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-2xl md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly budgets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Monthly budget</TableHead>
                          <TableHead className="text-right">Spent</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.categories
                          .filter((c) => c.id !== 'cat_income')
                          .map((c) => {
                            const spent =
                              budgetStats.rows.find((r) => r.categoryId === c.id)?.spentCents ||
                              groupExpenseByCategory(
                                state.transactions.filter((t) => dateInRange(t.date, range.min, range.max))
                              ).get(c.id) ||
                              0;
                            const budget = c.monthlyBudgetCents || 0;
                            const remaining = budget - spent;

                            return (
                              <TableRow key={c.id}>
                                <TableCell className="font-medium">
                                  <CategoryHover
                                    label={categoryLabel(state.categories, c.id)}
                                    stats={categoryHoverDetail(c.id)}
                                    currency={currency}
                                    hideCents={hideCents}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <BudgetInput
                                    valueCents={budget}
                                    currency={currency}
                                    hideCents={hideCents}
                                    onChangeCents={(v) => upsertCategoryBudget(c.id, v)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">{formatMoney(spent, currency, hideCents)}</TableCell>
                                <TableCell className={`text-right ${remaining < 0 ? 'text-rose-500' : ''}`}>
                                  {formatMoney(remaining, currency, hideCents)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">
                    Tip: Keep budgets simple. Start with 5 to 7 categories you actually use.
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Auto-categorization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Smart rules</div>
                      <div className="text-sm text-muted-foreground">Match merchants to categories</div>
                    </div>
                    <Switch
                      checked={state.settings.smartCategorize}
                      onCheckedChange={(v) =>
                        setState((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, smartCategorize: Boolean(v) },
                        }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Add a rule</div>
                    <RuleCreator categories={state.categories} onCreate={addRule} />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Your rules</div>
                    {state.rules.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No rules yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {state.rules.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-2 rounded-xl border p-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm">
                                Contains: <span className="font-medium">{r.contains}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Category: {categoryLabel(state.categories, r.categoryId)}
                              </div>
                            </div>
                            <Button variant="ghost" onClick={() => deleteRule(r.id)}>
                              Delete
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="rounded-2xl md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">What changed</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InsightList state={state} currency={currency} hideCents={hideCents} />
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Next best actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ActionCard
                    title="Set your top 3 budgets"
                    detail="Rent, groceries, and eating out is usually enough to start."
                    cta="Go to budgets"
                    onClick={() => setTab('budgets')}
                  />
                  <ActionCard
                    title="Import your last 90 days"
                    detail="Paste CSV from your bank export."
                    cta="Import CSV"
                    onClick={() => setImportOpen(true)}
                  />
                  <ActionCard
                    title="Track subscriptions"
                    detail="Add rules for recurring merchants."
                    cta="Add rule"
                    onClick={() => setTab('budgets')}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-2">
                    <Label>Currency</Label>
                    <Select
                      value={state.settings.currency}
                      onValueChange={(v) =>
                        setState((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, currency: v as any },
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border p-3">
                    <div>
                      <div className="text-sm font-medium">Hide cents</div>
                      <div className="text-sm text-muted-foreground">Round display to whole dollars</div>
                    </div>
                    <Switch
                      checked={state.settings.hideCents}
                      onCheckedChange={(v) =>
                        setState((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, hideCents: Boolean(v) },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border p-3">
                    <div>
                      <div className="text-sm font-medium">Smart categorization</div>
                      <div className="text-sm text-muted-foreground">Use rules while you type</div>
                    </div>
                    <Switch
                      checked={state.settings.smartCategorize}
                      onCheckedChange={(v) =>
                        setState((prev) => ({
                          ...prev,
                          settings: { ...prev.settings, smartCategorize: Boolean(v) },
                        }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Data</div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => exportCSV(state)}>
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                      </Button>
                      <Button variant="secondary" onClick={() => setImportOpen(true)}>
                        <Import className="mr-2 h-4 w-4" /> Import CSV
                      </Button>
                      <Button variant="destructive" onClick={resetState}>
                        Reset demo data
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      This app stores data in your browser. No server.
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Roadmap ideas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Bank sync (Plaid), plus manual CSV import.</li>
                    <li>Recurring transactions and subscription detection.</li>
                    <li>Shared budgets for couples, with per-person splits.</li>
                    <li>Goals: emergency fund, travel, down payment.</li>
                    <li>Rules 2.0: regex, priority, and per-account rules.</li>
                    <li>Privacy: passcode lock, encrypted local storage.</li>
                    <li>Mobile-first screens and quick-add widget.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <TxDialog
          open={txModalOpen}
          onOpenChange={setTxModalOpen}
          accounts={state.accounts}
          categories={state.categories}
          txDate={txDate}
          setTxDate={setTxDate}
          txMerchant={txMerchant}
          setTxMerchant={setTxMerchant}
          txAmount={txAmount}
          setTxAmount={setTxAmount}
          txType={txType}
          setTxType={setTxType}
          txCategoryId={txCategoryId}
          setTxCategoryId={setTxCategoryId}
          txAccountId={txAccountId}
          setTxAccountId={setTxAccountId}
          txNote={txNote}
          setTxNote={setTxNote}
          onAdd={addTransaction}
        />

        <Dialog open={importOpen} onOpenChange={(v) => setImportOpen(v)}>
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>Import CSV (paste)</DialogTitle>
              <DialogDescription>
                Use headers: date, merchant, amount, type, category, account, note.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>CSV text</Label>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const sample = [
                      'date,merchant,amount,type,category,account,note',
                      `${todayISO()},Coffee,4.50,expense,Eating Out,Credit Card,latte`,
                      `${todayISO()},Paycheque,2400.00,income,Income,Chequing,`,
                    ].join('\n');
                    setImportText(sample);
                    setTimeout(() => importRef.current?.focus(), 0);
                  }}
                >
                  Paste sample
                </Button>
              </div>
              <textarea
                ref={importRef}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="min-h-[220px] w-full rounded-2xl border bg-background p-3 text-sm"
                placeholder="date,merchant,amount,type,category,account,note"
              />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={importFromText}>Import</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Header(props: {
  state: AppState;
  datePreset: DatePreset;
  setDatePreset: (v: DatePreset) => void;
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  onAddTx: () => void;
  onExport: () => void;
  onImport: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const { state, datePreset, setDatePreset, accountFilter, setAccountFilter, search, setSearch } = props;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-1 text-xl font-semibold tracking-tight">
              <span>BudgetBoard</span>
              <sup className="text-xs align-top">™</sup>
            </div>
            <div className="text-sm text-muted-foreground">Built by Derrick Nguyen</div>
          </div>
        </div>
        <div className="mt-2 text-lg font-semibold leading-tight text-foreground">
          Budgeting &amp; Expense Analytics Dashboard
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="w-full rounded-2xl pl-9 md:w-[240px]"
              placeholder="Search transactions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[160px] rounded-2xl">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="last_90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[170px] rounded-2xl">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {state.accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle theme={props.theme} onToggle={props.onThemeChange} />
          <Button className="h-10" onClick={props.onAddTx}>
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
          <Button className="h-10" variant="secondary" onClick={props.onImport}>
            <Import className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button className="h-10" variant="secondary" onClick={props.onExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button className="h-10 rounded-2xl" variant="ghost">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TxDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
  categories: Category[];
  txDate: string;
  setTxDate: (v: string) => void;
  txMerchant: string;
  setTxMerchant: (v: string) => void;
  txAmount: string;
  setTxAmount: (v: string) => void;
  txType: TxType;
  setTxType: (v: TxType) => void;
  txCategoryId: string;
  setTxCategoryId: (v: string) => void;
  txAccountId: string;
  setTxAccountId: (v: string) => void;
  txNote: string;
  setTxNote: (v: string) => void;
  onAdd: () => void;
}) {
  const {
    open,
    onOpenChange,
    accounts,
    categories,
    txDate,
    setTxDate,
    txMerchant,
    setTxMerchant,
    txAmount,
    setTxAmount,
    txType,
    setTxType,
    txCategoryId,
    setTxCategoryId,
    txAccountId,
    setTxAccountId,
    txNote,
    setTxNote,
    onAdd,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Quick add an expense or income.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input className="rounded-2xl" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Merchant</Label>
            <Input
              className="rounded-2xl"
              value={txMerchant}
              onChange={(e) => setTxMerchant(e.target.value)}
              placeholder="Uber, Loblaws, Rent"
            />
          </div>

          <div className="grid gap-2">
            <Label>Amount</Label>
            <Input
              className="rounded-2xl"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="12.34"
            />
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={txType} onValueChange={(v) => setTxType(v as TxType)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={txCategoryId} onValueChange={setTxCategoryId} disabled={txType === 'income'}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.id !== 'cat_income')
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {categoryLabel(categories, c.id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Account</Label>
              <Select value={txAccountId} onValueChange={setTxAccountId}>
                <SelectTrigger className="rounded-2xl">
                  <CreditCard className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Note (optional)</Label>
            <Input
              className="rounded-2xl"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="Anything to remember"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAdd}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BudgetInput(props: {
  valueCents: number;
  currency: 'CAD' | 'USD';
  hideCents: boolean;
  onChangeCents: (v: number) => void;
}) {
  const [value, setValue] = useState(() => (props.valueCents / 100).toFixed(0));

  useEffect(() => {
    setValue((props.valueCents / 100).toFixed(0));
  }, [props.valueCents]);

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        className="h-9 w-[110px] rounded-2xl text-right"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const cents = Math.max(0, parseMoneyToCents(value));
          props.onChangeCents(cents);
        }}
      />
      <div className="hidden text-xs text-muted-foreground md:block">
        {formatMoney(props.valueCents, props.currency, true)}
      </div>
    </div>
  );
}

function RuleCreator(props: { categories: Category[]; onCreate: (contains: string, categoryId: string) => void }) {
  const [contains, setContains] = useState('');
  const [categoryId, setCategoryId] = useState('cat_other');

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <Label>Merchant contains</Label>
        <Input
          className="rounded-2xl"
          value={contains}
          onChange={(e) => setContains(e.target.value)}
          placeholder="uber, tim hortons"
        />
      </div>
      <div className="grid gap-2">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="rounded-2xl">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {props.categories
              .filter((c) => c.id !== 'cat_income')
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {categoryLabel(props.categories, c.id)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        className="w-full"
        onClick={() => {
          props.onCreate(contains, categoryId);
          setContains('');
        }}
      >
        Add rule
      </Button>
    </div>
  );
}

function CategoryHover(props: {
  label: string;
  stats: { txCount: number; merchants: { name: string; count: number; totalCents: number }[] };
  currency: 'CAD' | 'USD';
  hideCents: boolean;
}) {
  return (
    <Popover
      content={
        <div className="space-y-1">
          <div className="text-xs font-semibold">{props.label}</div>
          <div className="text-xs text-muted-foreground">Transactions: {props.stats.txCount}</div>
          {props.stats.merchants.length > 0 ? (
            <div className="space-y-1">
              {props.stats.merchants.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-xs">
                  <span className="truncate pr-2">{m.name}</span>
                  <span className="text-muted-foreground">
                    {m.count} · {formatMoney(m.totalCents, props.currency, props.hideCents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No merchants yet.</div>
          )}
        </div>
      }
    >
      <span
        tabIndex={0}
        className="cursor-help underline decoration-dashed underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {props.label}
      </span>
    </Popover>
  );
}

function ActionCard(props: { title: string; detail: string; cta: string; onClick: () => void }) {
  return (
    <div className="rounded-2xl border p-3">
      <div className="text-sm font-medium">{props.title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{props.detail}</div>
      <Button variant="secondary" className="mt-3 w-full" onClick={props.onClick}>
        {props.cta}
      </Button>
    </div>
  );
}

function InsightList(props: { state: AppState; currency: 'CAD' | 'USD'; hideCents: boolean }) {
  const { state, currency, hideCents } = props;

  const today = todayISO();
  const thisMonth = { min: monthStartISO(today), max: today };

  const d = new Date(`${today}T00:00:00`);
  d.setMonth(d.getMonth() - 1);
  const lastMonthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const lastMonthEndDate = new Date(`${lastMonthStart}T00:00:00`);
  lastMonthEndDate.setMonth(lastMonthEndDate.getMonth() + 1);
  lastMonthEndDate.setDate(lastMonthEndDate.getDate() - 1);
  const lastMonthEnd = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEndDate.getDate()).padStart(2, '0')}`;

  const lastMonth = { min: lastMonthStart, max: lastMonthEnd };

  const sum = (min: string, max: string, type: TxType) =>
    state.transactions
      .filter((t) => dateInRange(t.date, min, max))
      .filter((t) => t.type === type)
      .reduce((s, t) => s + t.amountCents, 0);

  const thisSpend = sum(thisMonth.min, thisMonth.max, 'expense');
  const lastSpend = sum(lastMonth.min, lastMonth.max, 'expense');

  const thisIncome = sum(thisMonth.min, thisMonth.max, 'income');
  const lastIncome = sum(lastMonth.min, lastMonth.max, 'income');

  const deltaSpend = thisSpend - lastSpend;
  const deltaIncome = thisIncome - lastIncome;

  const topCatThis = topExpenseCategory(state, thisMonth.min, thisMonth.max);
  const topCatLast = topExpenseCategory(state, lastMonth.min, lastMonth.max);

  const insights = [
    {
      title: 'Spending vs last month',
      detail:
        lastSpend === 0
          ? 'No spending last month to compare.'
          : `${deltaSpend >= 0 ? 'Up' : 'Down'} ${formatMoney(Math.abs(deltaSpend), currency, hideCents)} compared to last month.`,
      icon: deltaSpend >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />,
    },
    {
      title: 'Income vs last month',
      detail:
        lastIncome === 0
          ? 'No income last month to compare.'
          : `${deltaIncome >= 0 ? 'Up' : 'Down'} ${formatMoney(Math.abs(deltaIncome), currency, hideCents)} compared to last month.`,
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      title: 'Top spending category',
      detail: topCatThis
        ? `${topCatThis.name} is your biggest category this month at ${formatMoney(
            topCatThis.spentCents,
            currency,
            hideCents
          )}.`
        : 'Add expenses to see this.',
      icon: <Target className="h-4 w-4" />,
    },
    {
      title: 'Category shift',
      detail:
        topCatThis && topCatLast
          ? `Last month it was ${topCatLast.name}.`
          : 'Not enough data to compare categories.',
      icon: <Sparkles className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Comparison: This month ({thisMonth.min} to {thisMonth.max}) vs last month ({lastMonth.min} to{' '}
        {lastMonth.max})
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {insights.map((x) => (
          <div key={x.title} className="rounded-2xl border p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-muted">{x.icon}</div>
              <div className="text-sm font-medium">{x.title}</div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{x.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function topExpenseCategory(state: AppState, min: string, max: string) {
  const map = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.type !== 'expense') continue;
    if (!dateInRange(t.date, min, max)) continue;
    map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amountCents);
  }
  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const [categoryId, spentCents] = entries[0];
  return { id: categoryId, name: categoryLabel(state.categories, categoryId), spentCents };
}

function rangeLabel(preset: DatePreset) {
  if (preset === 'this_month') return 'This month';
  if (preset === 'last_month') return 'Last month';
  if (preset === 'last_90') return 'Last 90 days';
  return 'All time';
}

function categoryName(categories: Category[], id: string) {
  return categories.find((c) => c.id === id)?.name || 'Unknown';
}

function categoryLabel(categories: Category[], id: string) {
  const c = categories.find((x) => x.id === id);
  if (!c) return 'Unknown';
  return `${c.emoji ? `${c.emoji} ` : ''}${c.name}`;
}

function accountName(accounts: Account[], id: string) {
  return accounts.find((a) => a.id === id)?.name || 'Unknown';
}

function isTestMode() {
  try {
    const anyMeta: any = import.meta as any;
    return Boolean(anyMeta?.env?.MODE === 'test');
  } catch {
    return false;
  }
}

function assert(condition: any, message: string) {
  if (!condition) throw new Error(message);
}

function runSelfTests() {
  assert(parseMoneyToCents('$1,234.56') === 123456, 'parseMoneyToCents should parse formatted money');
  assert(parseMoneyToCents('-10') === -1000, 'parseMoneyToCents should keep sign');
  assert(parseMoneyToCents('abc') === 0, 'parseMoneyToCents should return 0 for invalid input');

  const csv = ['date,merchant,amount', '2025-01-01,"Coffee, Shop",4.50', '2025-01-02,Rent,1800.00'].join('\n');
  const rows = parseCSVText(csv);
  assert(rows.length === 3, 'parseCSVText should produce 3 rows');
  assert(rows[1][1] === 'Coffee, Shop', 'parseCSVText should handle quoted commas');

  const all = dateRangeForPreset('all');
  assert(all.min === '1900-01-01' && all.max === '2999-12-31', 'dateRangeForPreset(all) should return full range');
}

if (isTestMode()) {
  runSelfTests();
}
