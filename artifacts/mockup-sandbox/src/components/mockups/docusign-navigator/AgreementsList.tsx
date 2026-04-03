import { useState, useCallback, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  LogOut,
  User,
  ExternalLink,
  Download,
  DollarSign,
  CalendarDays,
  Globe,
  RotateCcw,
  Bell,
  Link2,
  Settings,
  Shield,
  Server,
  Key,
  Copy,
  Check,
  Upload,
  Trash2,
} from "lucide-react";

const API_BASE = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Party {
  name_in_agreement?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

interface Provisions {
  effective_date?: string;
  expiration_date?: string;
  total_agreement_value?: number;
  total_agreement_value_currency_code?: string;
  jurisdiction?: string;
  renewal_type?: string;
  renewal_notice_date?: string;
  termination_period_for_cause?: string;
  [key: string]: unknown;
}

interface Agreement {
  id: string;
  name?: string;
  title?: string;
  file_name?: string;
  document_id?: string;
  category?: string;
  review_status?: string;
  status?: string;
  type?: string;
  created_date_time?: string;
  last_modified_date_time?: string;
  parties?: Party[];
  provisions?: Provisions;
  source_name?: string;
  source_id?: string;
  languages?: string[];
  _links?: { document?: { href: string }; [key: string]: unknown };
  [key: string]: unknown;
}

interface ResponseMetadata {
  page_limit?: number;
  ctoken?: string;
  result_set_size?: number;
  total_set_size?: number;
  [key: string]: unknown;
}

interface ApiLinks {
  next?: { href: string };
  first?: { href: string };
  self?: { href: string };
  [key: string]: unknown;
}

interface AgreementsResponse {
  agreements?: Agreement[];
  data?: Agreement[];
  items?: Agreement[];
  response_metadata?: ResponseMetadata;
  _links?: ApiLinks;          // Navigator API: next page ctoken lives in _links.next.href
  ctoken?: string;
  response_ctoken?: string;
  cursor?: string;
  next_cursor?: string;
  total?: number;
  [key: string]: unknown;
}

function extractCtoken(data: AgreementsResponse): string | null {
  // Navigator API provides the ctoken inside _links.next.href as a query param
  const nextHref = data._links?.next?.href;
  if (nextHref) {
    const match = nextHref.match(/[?&]ctoken=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  // Fallbacks for other response shapes
  return (
    data.response_metadata?.ctoken ??
    data.ctoken ??
    data.response_ctoken ??
    data.cursor ??
    data.next_cursor ??
    null
  );
}

function extractTotal(data: AgreementsResponse): number | null {
  return data.response_metadata?.total_set_size ?? data.total ?? null;
}

interface AuthStatus {
  authenticated: boolean;
  accountId: string | null;
  accountName?: string | null;
  user?: { name?: string; email?: string; accountName?: string; accountId?: string } | null;
}

interface DebugInfo {
  account: {
    accountId: string | null;
    accountName: string | null;
    clientId: string | null;
    user: { name?: string; email?: string; sub?: string; accountName?: string } | null;
    tokenExpires: string | null;
  };
  auth: { mode: string; authenticated: boolean };
  scopes: string[];
  api: {
    baseUrl: string;
    environment: string;
    agreementsEndpoint: string;
    authEndpoint: string;
    tokenEndpoint: string;
  };
}

interface LastCall {
  method: string;
  url: string;
  params: Record<string, string>;
  status: number;
  responseBody: unknown;
  timestamp: string;
  durationMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function partyName(p: Party): string {
  return p.name_in_agreement ?? p.name ?? "Unknown";
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "short", day: "numeric",
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

function formatCurrency(value?: number, code?: string): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: code ?? "USD", maximumFractionDigits: 0,
    }).format(value);
  } catch { return `${code ?? "$"}${value.toLocaleString()}`; }
}

function isEffectiveSoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d > now && d.getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000;
}

function extractAgreements(data: AgreementsResponse): Agreement[] {
  return data.agreements ?? data.data ?? data.items ?? [];
}

function statusDot(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "bg-green-500";
  if (s === "completed") return "bg-blue-500";
  if (s === "draft" || s === "pending") return "bg-amber-400";
  if (s === "voided" || s === "declined" || s === "expired") return "bg-red-400";
  return "bg-gray-400";
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-200 transition-colors" title="Copy">
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-600" />
        : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────────

function SettingsModal({
  open,
  onClose,
  auth,
  lastCall,
}: {
  open: boolean;
  onClose: () => void;
  auth: AuthStatus;
  lastCall: LastCall | null;
}) {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"account" | "api" | "last-call">("account");

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/docusign/debug-info`)
      .then((r) => r.json())
      .then((d) => setDebugInfo(d as DebugInfo))
      .catch(() => {});
  }, [open]);

  const tabs = [
    { id: "account" as const, label: "Account & Auth", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "api" as const, label: "API Config", icon: <Server className="w-3.5 h-3.5" /> },
    { id: "last-call" as const, label: "Last API Call", icon: <Key className="w-3.5 h-3.5" />, badge: lastCall ? "1" : null },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B1E2E] flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-gray-900">
                Settings & Debug
              </DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5">
                Docusign Navigator API configuration
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-gray-100 rounded-lg p-0.5 w-fit">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === t.id
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.icon}
                {t.label}
                {t.badge && (
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {/* ── Account & Auth tab ── */}
          {activeTab === "account" && (
            <div className="space-y-5">
              {/* Account info */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Account
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {[
                    {
                      label: "Account Name",
                      value: debugInfo?.account.accountName
                        ?? auth.accountName
                        ?? auth.user?.accountName
                        ?? "—",
                      highlight: true,
                    },
                    {
                      label: "Account ID",
                      value: debugInfo?.account.accountId ?? auth.accountId ?? "—",
                      mono: true,
                    },
                    {
                      label: "Integration Key (Client ID)",
                      value: debugInfo?.account.clientId ?? "—",
                      mono: true,
                    },
                    {
                      label: "Signed In As",
                      value: debugInfo?.account.user?.name
                        ?? debugInfo?.account.user?.email
                        ?? auth.user?.name
                        ?? auth.user?.email
                        ?? "—",
                    },
                    {
                      label: "Email",
                      value: debugInfo?.account.user?.email ?? "—",
                    },
                    {
                      label: "Token Expires",
                      value: debugInfo?.account.tokenExpires
                        ? new Date(debugInfo.account.tokenExpires).toLocaleString()
                        : "—",
                    },
                  ].map(({ label, value, mono, highlight }) => (
                    <div key={label} className={`flex items-center justify-between px-4 py-2.5 ${highlight ? "bg-blue-50/60" : ""}`}>
                      <span className={`text-xs w-44 shrink-0 ${highlight ? "text-blue-700 font-semibold" : "text-gray-500"}`}>{label}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs truncate ${highlight ? "text-blue-900 font-bold" : mono ? "font-mono text-gray-900" : "font-medium text-gray-900"}`}>
                          {value}
                        </span>
                        {value !== "—" && <CopyButton text={value} />}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Auth mode */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Authentication
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-500 w-44 shrink-0">Status</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${debugInfo?.auth.authenticated ? "bg-green-500" : "bg-red-400"}`} />
                      <span className="text-xs font-medium text-gray-900">
                        {debugInfo?.auth.authenticated ? "Authenticated" : "Not authenticated"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-500 w-44 shrink-0">Auth Method</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {debugInfo?.auth.mode ?? "—"}
                    </Badge>
                  </div>
                </div>
              </section>

              {/* Scopes */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  OAuth Scopes
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap gap-2">
                    {(debugInfo?.scopes ?? ["adm_store_unified_repo_read"]).map((scope) => (
                      <div key={scope} className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-md text-xs font-mono text-blue-700">
                          <CheckCircle2 className="w-3 h-3 text-blue-500" />
                          {scope}
                        </span>
                        <CopyButton text={scope} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    These scopes grant read access to agreements stored in Docusign Navigator.
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* ── API Config tab ── */}
          {activeTab === "api" && (
            <div className="space-y-5">
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Environment
                </h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-500 w-44 shrink-0">Environment</span>
                    <Badge variant="secondary" className="text-xs">
                      {debugInfo?.api.environment ?? "sandbox (developer)"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-500 w-44 shrink-0">Base URL</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-mono text-gray-900 truncate">
                        {debugInfo?.api.baseUrl ?? "https://api-d.docusign.com/v1"}
                      </span>
                      <CopyButton text={debugInfo?.api.baseUrl ?? "https://api-d.docusign.com/v1"} />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Endpoints
                </h3>
                <div className="space-y-2">
                  {[
                    { label: "Agreements", method: "GET", url: debugInfo?.api.agreementsEndpoint },
                    { label: "OAuth Authorize", method: "GET", url: debugInfo?.api.authEndpoint },
                    { label: "OAuth Token", method: "POST", url: debugInfo?.api.tokenEndpoint },
                  ].map(({ label, method, url }) => (
                    <div key={label} className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-700">{label}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono ${
                          method === "GET" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                        }`}>
                          {method}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-gray-500 font-mono break-all flex-1">
                          {url ?? "—"}
                        </code>
                        {url && <CopyButton text={url} />}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ── Last API Call tab ── */}
          {activeTab === "last-call" && (
            <div className="space-y-5">
              {!lastCall ? (
                <div className="text-center py-12">
                  <Key className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">No API call made yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Fetch agreements to see the request details here.
                  </p>
                </div>
              ) : (
                <>
                  {/* Request summary */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Request
                    </h3>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-500 w-36 shrink-0">Method</span>
                        <span className="text-xs font-bold font-mono text-green-700 bg-green-50 px-2 py-0.5 rounded">
                          {lastCall.method}
                        </span>
                      </div>
                      <div className="px-4 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Full URL</span>
                          <CopyButton text={lastCall.url} />
                        </div>
                        <code className="text-xs text-gray-800 font-mono break-all leading-relaxed">
                          {lastCall.url}
                        </code>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-500 w-36 shrink-0">Timestamp</span>
                        <span className="text-xs text-gray-700 font-mono">
                          {new Date(lastCall.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-500 w-36 shrink-0">Duration</span>
                        <span className="text-xs text-gray-700 font-mono">{lastCall.durationMs}ms</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-500 w-36 shrink-0">HTTP Status</span>
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                          lastCall.status < 300
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}>
                          {lastCall.status}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Query params */}
                  <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Query Parameters
                    </h3>
                    {Object.keys(lastCall.params).length === 0 ? (
                      <p className="text-xs text-gray-400 italic px-1">No query parameters sent</p>
                    ) : (
                      <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">
                        {Object.entries(lastCall.params).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-xs font-mono text-blue-600 w-44 shrink-0">{key}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-gray-800">{value}</span>
                              <CopyButton text={value} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Response JSON */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Response Body
                      </h3>
                      <CopyButton text={JSON.stringify(lastCall.responseBody, null, 2)} />
                    </div>
                    <div className="relative bg-[#1e1e2e] rounded-xl border border-gray-800 overflow-hidden">
                      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                        <span className="ml-2 text-xs text-gray-500 font-mono">response.json</span>
                      </div>
                      <pre className="p-4 text-xs font-mono text-green-300 overflow-auto max-h-64 leading-relaxed">
                        {JSON.stringify(lastCall.responseBody, null, 2)}
                      </pre>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row expand detail ────────────────────────────────────────────────────────

function DetailPanel({
  agreement,
  detail,
  loading,
  error,
  showRaw,
  onToggleRaw,
  onDelete,
}: {
  agreement: Agreement;
  detail: Agreement | null;
  loading: boolean;
  error: string | null;
  showRaw: boolean;
  onToggleRaw: () => void;
  onDelete?: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const src = detail ?? agreement;

  const handleDelete = async () => {
    if (!src.id || deleting) return;
    const label = src.title ?? src.name ?? src.id;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE}/docusign/agreements/${encodeURIComponent(src.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? `Delete failed (${res.status})`);
      } else {
        onDelete?.(src.id);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };
  const p = src.provisions ?? {};
  const currency = formatCurrency(p.total_agreement_value, p.total_agreement_value_currency_code);
  const renewalLabel = p.renewal_type
    ? p.renewal_type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const displayTitle = src.title ?? src.name;
  const displayFileName = src.file_name;

  const provisions = [
    { icon: <CalendarDays className="w-3.5 h-3.5 text-blue-500" />, label: "Effective Date", value: formatDate(p.effective_date) },
    { icon: <CalendarDays className="w-3.5 h-3.5 text-orange-500" />, label: "Expiration Date", value: formatDate(p.expiration_date) },
    { icon: <DollarSign className="w-3.5 h-3.5 text-green-600" />, label: "Contract Value", value: currency ?? "—" },
    { icon: <Globe className="w-3.5 h-3.5 text-purple-500" />, label: "Jurisdiction", value: p.jurisdiction ?? "—" },
    { icon: <RotateCcw className="w-3.5 h-3.5 text-cyan-500" />, label: "Renewal Type", value: renewalLabel ?? "—" },
    { icon: <Bell className="w-3.5 h-3.5 text-amber-500" />, label: "Renewal Notice", value: formatDate(p.renewal_notice_date) },
    { icon: <Link2 className="w-3.5 h-3.5 text-gray-500" />, label: "Category", value: src.category ?? "—" },
    { icon: <Globe className="w-3.5 h-3.5 text-gray-400" />, label: "Language", value: src.languages?.join(", ").toUpperCase() ?? "—" },
  ];

  const parties = (src.parties ?? []);

  return (
    <TableRow className="bg-blue-50/40 hover:bg-blue-50/40 border-b-0">
      <TableCell colSpan={7} className="py-0 px-0">
        <div className="border-l-2 border-blue-400 mx-4 my-3 rounded-lg bg-white shadow-sm overflow-hidden">
          {/* Detail header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              {loading && <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
              {!loading && detail && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Live from <code className="font-mono text-xs">GET /agreements/{src.id?.slice(0, 8)}…</code>
                </span>
              )}
              {!loading && !detail && !error && (
                <span className="text-xs text-gray-400 font-mono">GET /agreements/{src.id?.slice(0, 8)}…</span>
              )}
              {error && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {error}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-md p-0.5">
              <button onClick={onToggleRaw}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${!showRaw ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                Provisions
              </button>
              <button onClick={onToggleRaw}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showRaw ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                Raw JSON
              </button>
            </div>
          </div>

          {showRaw ? (
            <pre className="p-4 text-xs font-mono text-gray-700 overflow-auto max-h-64 bg-gray-50 leading-relaxed">
              {JSON.stringify(detail ?? agreement, null, 2)}
            </pre>
          ) : (
            <div className="p-4">
              {/* Title + file name header */}
              {(displayTitle || displayFileName) && (
                <div className="mb-4 pb-3 border-b border-gray-100">
                  {displayTitle && (
                    <p className="text-sm font-semibold text-gray-900">{displayTitle}</p>
                  )}
                  {displayFileName && (
                    <p className="text-xs font-mono text-gray-400 mt-0.5 break-all">{displayFileName}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {src.review_status && (
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium
                        border-amber-200 bg-amber-50 text-amber-700">
                        Review: {src.review_status}
                      </span>
                    )}
                    {src.document_id && (
                      <span className="text-xs text-gray-300 font-mono">doc: {src.document_id.slice(0, 12)}…</span>
                    )}
                  </div>
                </div>
              )}

              {/* Provisions grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {provisions.map(({ icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{icon}</div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <p className="text-xs font-medium text-gray-800">{loading && !detail ? "…" : value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Parties */}
              {parties.length > 0 && (
                <div className="mb-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Parties</p>
                  <div className="flex flex-wrap gap-2">
                    {parties.map((party, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-700">
                        <User className="w-3 h-3" />
                        {partyName(party)}
                        {party.role && <span className="text-blue-400 text-[10px]">· {party.role}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer row */}
              <div className="flex items-center gap-4 pt-3 border-t border-gray-100 flex-wrap">
                {src._links?.document?.href && (() => {
                  const rawHref = src._links!.document!.href;
                  const rawName = src.file_name ?? src.title ?? src.id ?? "agreement";
                  const filename = /\.\w{2,5}$/.test(rawName) ? rawName : `${rawName}.pdf`;
                  const proxyUrl = `${API_BASE}/docusign/document?href=${encodeURIComponent(rawHref)}&filename=${encodeURIComponent(filename)}`;
                  return (
                    <a href={proxyUrl} download={filename}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
                      <Download className="w-3 h-3" /> Download document
                    </a>
                  );
                })()}
                {src.source_name === "external" && onDelete && (
                  <button
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:underline font-medium disabled:opacity-50">
                    {deleting
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Deleting…</>
                      : <><Trash2 className="w-3 h-3" /> Delete (external)</>}
                  </button>
                )}
                {deleteError && (
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {deleteError}
                  </span>
                )}
                {src.id && (
                  <span className="text-xs text-gray-300 font-mono ml-auto">ID: {src.id}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Agreement row ────────────────────────────────────────────────────────────

function AgreementRow({
  agreement,
  onDetailFetch,
  onDelete,
}: {
  agreement: Agreement;
  onDetailFetch: (call: LastCall) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<Agreement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const fetchedRef = useRef(false);

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !fetchedRef.current && agreement.id) {
      fetchedRef.current = true;
      setDetailLoading(true);
      setDetailError(null);
      const url = `${API_BASE}/docusign/agreements/${encodeURIComponent(agreement.id)}`;
      const start = Date.now();
      try {
        const res = await fetch(url);
        const durationMs = Date.now() - start;
        const json = (await res.json()) as Agreement;
        onDetailFetch({
          method: "GET",
          url,
          params: {},
          status: res.status,
          responseBody: json,
          timestamp: new Date().toISOString(),
          durationMs,
        });
        if (!res.ok) {
          setDetailError((json as { error?: string }).error ?? `Status ${res.status}`);
        } else {
          setDetail(json);
        }
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : "Network error");
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const p = agreement.provisions ?? {};
  const currency = formatCurrency(p.total_agreement_value, p.total_agreement_value_currency_code);
  const soon = isEffectiveSoon(p.effective_date);
  const parties = (agreement.parties ?? []).map(partyName).filter(Boolean);

  return (
    <>
      <TableRow className="group cursor-pointer hover:bg-gray-50/80 transition-colors"
        onClick={() => void handleExpand()}>
        <TableCell className="py-3 pr-3">
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate max-w-[230px]">
                {detail?.title ?? agreement.title ?? detail?.name ?? agreement.name ?? "Untitled Agreement"}
                {detailLoading && !detail && (
                  <span className="ml-1.5 inline-block w-3 h-3 rounded-full border border-gray-300 border-t-blue-400 animate-spin align-middle" />
                )}
              </p>
              {(detail?.file_name ?? agreement.file_name) && (
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[230px] font-mono" title={detail?.file_name ?? agreement.file_name}>
                  {detail?.file_name ?? agreement.file_name}
                </p>
              )}
              {!(detail?.file_name ?? agreement.file_name) && (detail?.source_name ?? agreement.source_name) && (
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[230px]">
                  via {detail?.source_name ?? agreement.source_name}
                </p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="py-3">
          {parties.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {parties.slice(0, 2).map((name, i) => (
                <span key={i} className="text-xs text-blue-600 truncate max-w-[150px]">{name}</span>
              ))}
              {parties.length > 2 && (
                <span className="text-xs text-gray-400">+{parties.length - 2} more</span>
              )}
            </div>
          ) : <span className="text-xs text-gray-300">—</span>}
        </TableCell>
        <TableCell className="py-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(agreement.status)}`} />
              <span className="text-xs font-medium text-gray-700">
                {soon ? "Effective Soon" : (agreement.status ?? "Unknown")}
              </span>
            </div>
            {p.effective_date && (
              <span className="text-xs text-gray-400 ml-3.5">Effective {formatDate(p.effective_date)}</span>
            )}
          </div>
        </TableCell>
        <TableCell className="py-3">
          <span className="text-xs text-gray-600 font-medium">{agreement.type ?? "—"}</span>
        </TableCell>
        <TableCell className="py-3">
          {currency
            ? <span className="text-xs font-semibold text-gray-800">{currency}</span>
            : <span className="text-xs text-gray-300">—</span>}
        </TableCell>
        <TableCell className="py-3">
          {p.expiration_date ? (
            <div className="flex flex-col">
              <span className="text-xs text-gray-600">{formatDate(p.expiration_date)}</span>
              {p.renewal_type && (
                <span className="text-xs text-cyan-600 mt-0.5">
                  {p.renewal_type.replace(/_/g, " ").toLowerCase()}
                </span>
              )}
            </div>
          ) : <span className="text-xs text-gray-300">—</span>}
        </TableCell>
        <TableCell className="py-3 w-8 text-right">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400 inline" />
            : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors inline" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <DetailPanel
          agreement={agreement}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw((r) => !r)}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ agreements, totalCount }: { agreements: Agreement[]; totalCount: number | null }) {
  const counts = agreements.reduce<Record<string, number>>((acc, ag) => {
    const s = (ag.status ?? "unknown").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const totalValue = agreements.reduce((s, ag) => s + (ag.provisions?.total_agreement_value ?? 0), 0);
  const displayTotal = totalCount ?? agreements.length;

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {[
        { label: totalCount != null ? "Total" : "Loaded", value: displayTotal, color: "text-gray-900" },
        { label: "Active", value: counts["active"] ?? 0, color: "text-green-700" },
        { label: "Pending", value: (counts["pending"] ?? 0) + (counts["in_progress"] ?? 0), color: "text-amber-700" },
        { label: "Expired", value: counts["expired"] ?? 0, color: "text-red-600" },
        { label: "Total Value", value: totalValue > 0 ? (formatCurrency(totalValue) ?? "—") : "—", color: "text-blue-700" },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

interface UploadFileItem {
  file: File;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
}

function UploadDialog({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFiles([]); setUploading(false); setDone(false); setGlobalError(null); };
  const handleClose = () => { reset(); onClose(); };

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => [...prev, ...pdfs.map((f) => ({ file: f, status: "idle" as const }))]);
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setGlobalError(null);

    try {
      // Step 1: create bulk upload job
      const startRes = await fetch(`${API_BASE}/docusign/upload/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: files.length }),
      });
      if (!startRes.ok) {
        const err = (await startRes.json().catch(() => ({}))) as {
          error?: string;
          rawText?: string;
          details?: unknown;
        };
        const detail = typeof err.details === "string"
          ? err.details
          : err.rawText
            ? err.rawText.slice(0, 200)
            : JSON.stringify(err.details ?? "");
        throw new Error(`${err.error ?? `Job creation failed (${startRes.status})`}${detail ? ` — ${detail}` : ""}`);
      }
      // DocuSign response: { id: <jobId>, _embedded: { documents: [{ id, _actions: { upload_document: url } }] } }
      const jobData = (await startRes.json()) as {
        id?: string;
        job_id?: string; // fallback in case API uses this key
        _embedded?: { documents?: Array<{ id?: string; _actions?: { upload_document?: string } }> };
        documents?: Array<{ document_id?: string; upload_url?: string }>; // legacy fallback
      };
      const jobId = jobData.id ?? jobData.job_id ?? "";
      const docSlots = jobData._embedded?.documents ?? jobData.documents ?? [];

      // Step 2: upload each file to its SAS slot
      await Promise.all(
        files.map(async (item, idx) => {
          const slot = docSlots[idx];
          const uploadUrl = (slot as { _actions?: { upload_document?: string }; upload_url?: string } | undefined)
            ?._actions?.upload_document
            ?? (slot as { upload_url?: string } | undefined)?.upload_url;
          if (!slot || !uploadUrl) {
            setFiles((prev) =>
              prev.map((f, i) => i === idx ? { ...f, status: "error", error: "No upload slot assigned" } : f),
            );
            return;
          }
          setFiles((prev) => prev.map((f, i) => i === idx ? { ...f, status: "uploading" } : f));
          try {
            const qs = new URLSearchParams({
              upload_url: uploadUrl,
              filename: item.file.name,
            });
            const fileRes = await fetch(`${API_BASE}/docusign/upload/file?${qs}`, {
              method: "POST",
              headers: {
                "Content-Type": item.file.type || "application/pdf",
                "x-file-type": item.file.type || "application/pdf",
              },
              body: item.file,
            });
            if (!fileRes.ok) {
              const err = (await fileRes.json()) as { error?: string };
              setFiles((prev) =>
                prev.map((f, i) =>
                  i === idx ? { ...f, status: "error", error: err.error ?? `Upload failed (${fileRes.status})` } : f,
                ),
              );
            } else {
              setFiles((prev) => prev.map((f, i) => i === idx ? { ...f, status: "done" } : f));
            }
          } catch (err) {
            setFiles((prev) =>
              prev.map((f, i) =>
                i === idx ? { ...f, status: "error", error: err instanceof Error ? err.message : "Upload failed" } : f,
              ),
            );
          }
        }),
      );

      // Step 3: complete the job
      const completeRes = await fetch(`${API_BASE}/docusign/upload/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!completeRes.ok) {
        const err = (await completeRes.json()) as { error?: string };
        setGlobalError(`Job completion failed: ${err.error ?? completeRes.status}. Files may still be processed.`);
      }

      setDone(true);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Upload failed");
      setFiles((prev) =>
        prev.map((f) => f.status === "idle" ? { ...f, status: "error", error: "Aborted" } : f),
      );
    } finally {
      setUploading(false);
    }
  };

  const successCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !uploading) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload Documents to Navigator
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-gray-900 mb-1">
              {successCount} document{successCount !== 1 ? "s" : ""} submitted
            </p>
            <p className="text-sm text-gray-500 mb-1">
              Tagged as{" "}
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">external</span>.{" "}
              Navigator is processing them — they'll appear in the list shortly.
            </p>
            {globalError && (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 border border-amber-100 rounded px-3 py-2">{globalError}</p>
            )}
            {errorCount > 0 && (
              <p className="text-xs text-red-500 mt-1">{errorCount} file(s) had errors during upload.</p>
            )}
            <div className="flex gap-2 mt-5 justify-center">
              <Button variant="outline" onClick={handleClose}>Close</Button>
              <Button
                className="bg-[#1B1E2E] hover:bg-[#2b3050] text-white gap-1.5"
                onClick={() => { handleClose(); onComplete(); }}>
                <RefreshCw className="w-3.5 h-3.5" /> Refresh agreements
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mt-1 ${
                dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
              }`}>
              <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Drop PDFs here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">PDF files only · Multiple allowed</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {files.map((item, idx) => (
                  <div key={idx}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{item.file.name}</p>
                      <p className="text-[10px] text-gray-400">{(item.file.size / 1024).toFixed(0)} KB</p>
                      {item.status === "error" && item.error && (
                        <p className="text-[10px] text-red-500 truncate">{item.error}</p>
                      )}
                    </div>
                    {item.status === "idle" && !uploading && (
                      <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {item.status === "uploading" && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                    {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                    {item.status === "error" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  </div>
                ))}
              </div>
            )}

            {globalError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2 mt-2">{globalError}</p>
            )}

            <p className="text-xs text-gray-400 mt-2">
              Files will be tagged as{" "}
              <span className="font-mono bg-gray-100 px-1 rounded text-[11px]">source_name: external</span>{" "}
              in Navigator for easy identification.
            </p>

            <div className="flex gap-2 mt-3 justify-end">
              <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
              <Button
                className="bg-[#1B1E2E] hover:bg-[#2b3050] text-white gap-1.5"
                onClick={() => void handleUpload()}
                disabled={files.length === 0 || uploading}>
                {uploading
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="w-3.5 h-3.5" /> Upload {files.length > 0 ? `${files.length} ` : ""}document{files.length !== 1 ? "s" : ""}</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Connect screen ───────────────────────────────────────────────────────────

function ConnectScreen({ onSuccess, accountId }: { onSuccess: () => void; accountId: string | null }) {
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "docusign-auth-success") { setConnecting(false); onSuccess(); }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSuccess]);

  const handleConnect = () => {
    setConnecting(true);
    const w = 520, h = 660, left = Math.max(0, (screen.width - w) / 2), top = Math.max(0, (screen.height - h) / 2);
    const popup = window.open(`${API_BASE}/docusign/auth/start`, "docusign-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);
    popupRef.current = popup;
    const timer = setInterval(() => { if (popup?.closed) { clearInterval(timer); setConnecting(false); } }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1B1E2E] flex items-center justify-center mx-auto mb-6">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Docusign Navigator</h1>
        <p className="text-sm text-gray-500 mb-8">
          Connect your account to browse agreements with AI-extracted metadata.
        </p>
        {accountId && (
          <div className="mb-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Account {accountId} configured
          </div>
        )}
        <Button size="lg" className="w-full gap-2 bg-[#1B1E2E] hover:bg-[#2b3050] text-white h-11"
          onClick={handleConnect} disabled={connecting}>
          {connecting
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Waiting for authorization...</>
            : <><ExternalLink className="w-4 h-4" /> Connect with Docusign</>}
        </Button>
        {connecting && <p className="mt-3 text-xs text-gray-400">A popup opened — allow popups if blocked.</p>}
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function AgreementsView({ auth, onLogout }: { auth: AuthStatus; onLogout: () => void }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [rawResponse, setRawResponse] = useState<AgreementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchAllProgress, setFetchAllProgress] = useState<{ pages: number; count: number } | null>(null);
  const [nextCtoken, setNextCtoken] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [lastCall, setLastCall] = useState<LastCall | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Basic controls
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limitFilter, setLimitFilter] = useState("25");
  const [fetchAllPages, setFetchAllPages] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced / server-side filters
  const [titleFilter, setTitleFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("all");
  const [sortField, setSortField] = useState("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [effectiveDateFrom, setEffectiveDateFrom] = useState("");
  const [effectiveDateTo, setEffectiveDateTo] = useState("");
  const [expirationDateFrom, setExpirationDateFrom] = useState("");
  const [expirationDateTo, setExpirationDateTo] = useState("");
  const [customFilter, setCustomFilter] = useState("");

  // Build OData $filter string from individual fields
  const buildODataFilter = useCallback((): string => {
    if (customFilter.trim()) return customFilter.trim();
    const parts: string[] = [];
    if (typeFilter !== "all") parts.push(`type eq '${typeFilter}'`);
    if (effectiveDateFrom) parts.push(`provisions/effective_date ge ${effectiveDateFrom}`);
    if (effectiveDateTo) parts.push(`provisions/effective_date le ${effectiveDateTo}`);
    if (expirationDateFrom) parts.push(`provisions/expiration_date ge ${expirationDateFrom}`);
    if (expirationDateTo) parts.push(`provisions/expiration_date le ${expirationDateTo}`);
    return parts.join(" and ");
  }, [customFilter, typeFilter, effectiveDateFrom, effectiveDateTo, expirationDateFrom, expirationDateTo]);

  const builtFilter = buildODataFilter();

  // Client-side search applied on top of server results
  const displayedAgreements = search.trim()
    ? agreements.filter((ag) => {
        const q = search.toLowerCase();
        return (
          (ag.title ?? ag.name ?? "").toLowerCase().includes(q) ||
          (ag.type ?? "").toLowerCase().includes(q) ||
          (ag.category ?? "").toLowerCase().includes(q) ||
          (ag.source_name ?? "").toLowerCase().includes(q) ||
          (ag.file_name ?? "").toLowerCase().includes(q) ||
          (ag.parties ?? []).some((p) => (p.name_in_agreement ?? p.name ?? "").toLowerCase().includes(q))
        );
      })
    : agreements;

  const handleLogout = async () => {
    await fetch(`${API_BASE}/docusign/auth/logout`, { method: "POST" });
    onLogout();
  };

  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFetchAllProgress(null);

    const params: Record<string, string> = {};
    if (statusFilter !== "all") params["status"] = statusFilter;
    if (titleFilter.trim()) params["title"] = titleFilter.trim();
    if (partyFilter.trim()) params["parties.name_in_agreement"] = partyFilter.trim();
    if (reviewStatusFilter !== "all") params["review_status"] = reviewStatusFilter;
    if (sortField !== "all") { params["sort"] = sortField; params["direction"] = sortDirection; }
    const odata = buildODataFilter();
    if (odata) params["$filter"] = odata;
    params["limit"] = fetchAllPages ? "100" : limitFilter;

    const buildUrl = (extra: Record<string, string> = {}) => {
      const qs = new URLSearchParams({ ...params, ...extra });
      return `${API_BASE}/docusign/agreements?${qs}`;
    };

    setNextCtoken(null);
    setPageCount(0);
    setTotalCount(null);

    const start = Date.now();
    try {
      if (!fetchAllPages) {
        const url = buildUrl();
        const res = await fetch(url);
        const durationMs = Date.now() - start;
        const json = (await res.json()) as AgreementsResponse;
        setLastCall({ method: "GET", url, params, status: res.status, responseBody: json, timestamp: new Date().toISOString(), durationMs });
        if (!res.ok) { setError((json as { error?: string }).error ?? `Status ${res.status}`); return; }
        setRawResponse(json);
        setAgreements(extractAgreements(json));
        setNextCtoken(extractCtoken(json));
        setTotalCount(extractTotal(json));
        setPageCount(1);
        setFetched(true);
      } else {
        // Fetch all pages using ctoken
        let allAgreements: Agreement[] = [];
        let pageCount = 0;
        let ctoken: string | null = null;
        let lastJson: AgreementsResponse = {};
        let lastRes: Response | null = null;

        do {
          const url = buildUrl(ctoken ? { ctoken } : {});
          const res = await fetch(url);
          lastRes = res;
          const json = (await res.json()) as AgreementsResponse;
          if (!res.ok) {
            setError((json as { error?: string }).error ?? `Status ${res.status}`);
            return;
          }
          const page = extractAgreements(json);
          allAgreements = [...allAgreements, ...page];
          pageCount++;
          ctoken = extractCtoken(json);
          lastJson = json;
          setFetchAllProgress({ pages: pageCount, count: allAgreements.length });
        } while (ctoken);

        const durationMs = Date.now() - start;
        setLastCall({ method: "GET", url: buildUrl(), params: { ...params, ctoken: "(all pages)" }, status: lastRes!.status, responseBody: { total_fetched: allAgreements.length, pages: pageCount, last_page_response: lastJson }, timestamp: new Date().toISOString(), durationMs });
        setRawResponse({ ...lastJson, data: allAgreements, total: allAgreements.length });
        setAgreements(allAgreements);
        setFetched(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
      setFetchAllProgress(null);
    }
  }, [statusFilter, limitFilter, fetchAllPages, titleFilter, partyFilter, reviewStatusFilter, sortField, sortDirection, buildODataFilter]);

  const loadNextPage = useCallback(async () => {
    if (!nextCtoken) return;
    setLoadingMore(true);
    setError(null);
    const params: Record<string, string> = {};
    if (statusFilter !== "all") params["status"] = statusFilter;
    if (titleFilter.trim()) params["title"] = titleFilter.trim();
    if (partyFilter.trim()) params["parties.name_in_agreement"] = partyFilter.trim();
    if (reviewStatusFilter !== "all") params["review_status"] = reviewStatusFilter;
    if (sortField !== "all") { params["sort"] = sortField; params["direction"] = sortDirection; }
    const odata = buildODataFilter();
    if (odata) params["$filter"] = odata;
    params["limit"] = limitFilter;
    params["ctoken"] = nextCtoken;
    const qs = new URLSearchParams(params);
    const url = `${API_BASE}/docusign/agreements?${qs}`;
    const start = Date.now();
    try {
      const res = await fetch(url);
      const durationMs = Date.now() - start;
      const json = (await res.json()) as AgreementsResponse;
      setLastCall({ method: "GET", url, params, status: res.status, responseBody: json, timestamp: new Date().toISOString(), durationMs });
      if (!res.ok) { setError((json as { error?: string }).error ?? `Status ${res.status}`); return; }
      const newItems = extractAgreements(json);
      setAgreements((prev) => [...prev, ...newItems]);
      setNextCtoken(extractCtoken(json));
      setTotalCount((prev) => extractTotal(json) ?? prev);
      setPageCount((p) => p + 1);
      setRawResponse(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCtoken, statusFilter, limitFilter, titleFilter, partyFilter, reviewStatusFilter, sortField, sortDirection, buildODataFilter]);

  const hasAdvancedFilters = typeFilter !== "all" || reviewStatusFilter !== "all" || sortField !== "all"
    || effectiveDateFrom || effectiveDateTo || expirationDateFrom || expirationDateTo || customFilter || titleFilter || partyFilter;

  const hasAnyFilter = !!search.trim() || statusFilter !== "all" || fetchAllPages || hasAdvancedFilters;

  const resetAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setLimitFilter("25");
    setFetchAllPages(false);
    setTitleFilter("");
    setPartyFilter("");
    setTypeFilter("all");
    setReviewStatusFilter("all");
    setSortField("all");
    setSortDirection("desc");
    setEffectiveDateFrom("");
    setEffectiveDateTo("");
    setExpirationDateFrom("");
    setExpirationDateTo("");
    setCustomFilter("");
    setNextCtoken(null);
    setPageCount(0);
    setTotalCount(null);
  };

  const displayName = auth.user?.name ?? auth.user?.email ?? null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-9 h-9 rounded-lg bg-[#1B1E2E] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Navigator Agreements</h1>
            </div>
            <p className="text-sm text-gray-500 ml-12">
              AI-extracted agreement metadata from{" "}
              {auth.accountName ?? auth.user?.accountName
                ? <span className="font-medium text-gray-700">{auth.accountName ?? auth.user?.accountName}</span>
                : "Docusign Navigator"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {displayName && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <span className="hidden sm:block text-sm">{displayName}</span>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 h-8"
              onClick={() => setUploadOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-gray-600"
              onClick={() => setSettingsOpen(true)} title="Settings & Debug">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 h-8"
              onClick={() => void handleLogout()}>
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </Button>
          </div>
        </div>

        {fetched && !loading && agreements.length > 0 && <StatsBar agreements={agreements} totalCount={totalCount} />}

        {/* Controls card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5 space-y-3">
          {/* Row 1: quick filters */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Quick filter (client-side)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9 h-9 text-sm" placeholder="Filter by title, party, type, file…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> Status</span>
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="COMPLETE">Complete</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Per page</label>
              <Select value={fetchAllPages ? "all" : limitFilter}
                onValueChange={(v) => { if (v === "all") { setFetchAllPages(true); } else { setFetchAllPages(false); setLimitFilter(v); } }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="all">All pages ∞</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="h-9 gap-2 bg-[#1B1E2E] hover:bg-[#2b3050] text-white"
              onClick={() => void fetchAgreements()} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading && fetchAllProgress
                ? `Page ${fetchAllProgress.pages} · ${fetchAllProgress.count} loaded…`
                : fetched ? "Refresh" : "Fetch Agreements"}
            </Button>
            {hasAnyFilter && (
              <button
                onClick={resetAllFilters}
                className="flex items-center gap-1.5 text-xs h-9 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                title="Clear all filters">
                <XCircle className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={`flex items-center gap-1.5 text-xs h-9 px-3 rounded-lg border transition-colors ${showAdvanced || hasAdvancedFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:text-gray-700"}`}>
              <Filter className="w-3.5 h-3.5" />
              Server filters
              {hasAdvancedFilters && <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">!</span>}
              {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>

          {/* Row 2: advanced server-side filters (collapsible) */}
          {showAdvanced && (
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <div className="flex flex-wrap gap-3">
                {/* Title */}
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title contains</label>
                  <Input className="h-8 text-xs" placeholder="e.g. Master Services"
                    value={titleFilter} onChange={(e) => setTitleFilter(e.target.value)} />
                </div>
                {/* Party name */}
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Party name</label>
                  <Input className="h-8 text-xs" placeholder="e.g. Acme Corp"
                    value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} />
                </div>
                {/* Type ($filter) */}
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Agreement type</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any type</SelectItem>
                      <SelectItem value="Msa">MSA</SelectItem>
                      <SelectItem value="Nda">NDA</SelectItem>
                      <SelectItem value="Sow">SOW</SelectItem>
                      <SelectItem value="Amendment">Amendment</SelectItem>
                      <SelectItem value="Order">Order</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Review status */}
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Review status</label>
                  <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="COMPLETE">Complete</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Effective from</label>
                  <Input type="date" className="h-8 text-xs" value={effectiveDateFrom}
                    onChange={(e) => setEffectiveDateFrom(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Effective to</label>
                  <Input type="date" className="h-8 text-xs" value={effectiveDateTo}
                    onChange={(e) => setEffectiveDateTo(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Expires from</label>
                  <Input type="date" className="h-8 text-xs" value={expirationDateFrom}
                    onChange={(e) => setExpirationDateFrom(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[130px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Expires to</label>
                  <Input type="date" className="h-8 text-xs" value={expirationDateTo}
                    onChange={(e) => setExpirationDateTo(e.target.value)} />
                </div>
                {/* Sort */}
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sort by</label>
                  <Select value={sortField} onValueChange={setSortField}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Default</SelectItem>
                      <SelectItem value="created_at">Created</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="provisions/effective_date">Effective date</SelectItem>
                      <SelectItem value="provisions/expiration_date">Expiration date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Direction</label>
                  <Select value={sortDirection} onValueChange={(v) => setSortDirection(v as "asc" | "desc")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Descending</SelectItem>
                      <SelectItem value="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom $filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Custom <code className="font-mono">$filter</code> expression
                  <span className="ml-2 text-gray-400 font-normal">(overrides type / date filters above)</span>
                </label>
                <Input className="h-8 text-xs font-mono" placeholder="e.g. type in ('Msa','Nda') and provisions/effective_date ge 2024-01-01"
                  value={customFilter} onChange={(e) => setCustomFilter(e.target.value)} />
              </div>

              {/* Built filter preview */}
              {builtFilter && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <code className="text-xs font-mono text-blue-700 flex-1 break-all">$filter={builtFilter}</code>
                  <CopyButton text={builtFilter} />
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={resetAllFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Clear all filters
                </button>
              </div>
            </div>
          )}

          {/* Last call hint */}
          {lastCall && !loading && (
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <code className="text-xs text-gray-400 font-mono truncate max-w-[500px]">
                GET {lastCall.url.replace(API_BASE, "")}
              </code>
              <button onClick={() => setSettingsOpen(true)}
                className="text-xs text-blue-500 hover:underline flex items-center gap-1 shrink-0 ml-2">
                <Key className="w-3 h-3" /> View full request
              </button>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-medium">{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {(fetched || loading) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="text-sm text-gray-500">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    {fetchAllProgress
                      ? `Fetching all pages — page ${fetchAllProgress.pages}, ${fetchAllProgress.count} agreements loaded…`
                      : "Loading…"}
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-gray-900">{displayedAgreements.length}</span>
                    {search.trim() && displayedAgreements.length !== agreements.length && (
                      <span className="text-gray-400"> of {agreements.length}</span>
                    )}
                    {" "}agreement{displayedAgreements.length !== 1 ? "s" : ""}
                    {rawResponse?.total != null && !search.trim() && (
                      <span className="text-gray-400"> of {rawResponse.total} total</span>
                    )}
                    {search.trim() && (
                      <span className="text-gray-400 ml-1">matching "{search}"</span>
                    )}
                    {fetchAllPages && !search.trim() && (
                      <span className="ml-2 text-xs text-green-600">· all pages fetched</span>
                    )}
                  </>
                )}
              </span>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {(["table", "raw"] as const).map((m) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                    {m === "raw" ? "Raw JSON" : "Table"}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
              </div>
            ) : viewMode === "raw" ? (
              <pre className="p-5 text-xs text-gray-700 overflow-auto max-h-[520px] bg-gray-50 font-mono leading-relaxed">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            ) : displayedAgreements.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">
                  {search.trim() ? `No agreements match "${search}"` : "No agreements found"}
                </p>
                {search.trim() && (
                  <button onClick={() => setSearch("")} className="mt-2 text-xs text-blue-500 hover:underline">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="text-xs font-semibold text-gray-500 w-[28%]">File Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Parties</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Agreement Type</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Value</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500">Expiration</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedAgreements.map((ag, idx) => (
                    <AgreementRow key={ag.id ?? idx} agreement={ag}
                      onDetailFetch={(call) => setLastCall(call)}
                      onDelete={(id) => setAgreements((prev) => prev.filter((a) => a.id !== id))} />
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination footer */}
            {!loading && fetched && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    Page{pageCount > 1 ? `s 1–${pageCount}` : ` ${pageCount}`} loaded
                    {" · "}<span className="font-semibold text-gray-700">{agreements.length}</span>
                    {totalCount != null && (
                      <> of <span className="font-semibold text-gray-700">{totalCount}</span></>
                    )}
                    {" "}agreements
                  </span>
                  {nextCtoken && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <ChevronRight className="w-3 h-3" /> more pages available
                    </span>
                  )}
                  {!nextCtoken && fetched && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3 h-3" /> all results loaded
                    </span>
                  )}
                </div>
                {nextCtoken && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm"
                      className="h-7 gap-1.5 text-xs text-gray-700"
                      onClick={() => void loadNextPage()}
                      disabled={loadingMore}>
                      {loadingMore
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</>
                        : <><ChevronRight className="w-3 h-3" /> Load next {limitFilter}</>}
                    </Button>
                    <Button variant="outline" size="sm"
                      className="h-7 gap-1.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => { setFetchAllPages(true); void fetchAgreements(); }}
                      disabled={loading || loadingMore}>
                      <RefreshCw className="w-3 h-3" /> Fetch all remaining
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!fetched && !loading && !error && (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Ready to fetch agreements</h3>
            <p className="text-xs text-gray-400">
              Click <strong className="text-gray-600">Fetch Agreements</strong> to load AI-extracted data.
            </p>
          </div>
        )}
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} auth={auth} lastCall={lastCall} />
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onComplete={() => void fetchAgreements()}
      />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AgreementsList() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/docusign/auth/status`);
      const data = (await res.json()) as AuthStatus;
      setAuth(data);
    } catch {
      setAuth({ authenticated: false, accountId: null });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void checkAuth(); }, [checkAuth]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!auth?.authenticated) {
    return <ConnectScreen accountId={auth?.accountId ?? null} onSuccess={() => void checkAuth()} />;
  }

  return (
    <AgreementsView
      auth={auth}
      onLogout={() => setAuth({ authenticated: false, accountId: auth.accountId })}
    />
  );
}
