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

interface AgreementsResponse {
  agreements?: Agreement[];
  data?: Agreement[];
  items?: Agreement[];
  cursor?: string;
  next_cursor?: string;
  total?: number;
  [key: string]: unknown;
}

interface AuthStatus {
  authenticated: boolean;
  accountId: string | null;
  user?: { name?: string; email?: string } | null;
}

interface DebugInfo {
  account: {
    accountId: string | null;
    clientId: string | null;
    user: { name?: string; email?: string; sub?: string } | null;
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
                      label: "User",
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
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs text-gray-900 truncate ${mono ? "font-mono" : "font-medium"}`}>
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

function DetailRow({ agreement }: { agreement: Agreement }) {
  const p = agreement.provisions ?? {};
  const currency = formatCurrency(p.total_agreement_value, p.total_agreement_value_currency_code);
  const renewalLabel = p.renewal_type
    ? p.renewal_type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const items = [
    { icon: <CalendarDays className="w-3.5 h-3.5 text-blue-500" />, label: "Effective Date", value: formatDate(p.effective_date) },
    { icon: <CalendarDays className="w-3.5 h-3.5 text-orange-500" />, label: "Expiration Date", value: formatDate(p.expiration_date) },
    { icon: <DollarSign className="w-3.5 h-3.5 text-green-600" />, label: "Contract Value", value: currency ?? "—" },
    { icon: <Globe className="w-3.5 h-3.5 text-purple-500" />, label: "Jurisdiction", value: p.jurisdiction ?? "—" },
    { icon: <RotateCcw className="w-3.5 h-3.5 text-cyan-500" />, label: "Renewal Type", value: renewalLabel ?? "—" },
    { icon: <Bell className="w-3.5 h-3.5 text-amber-500" />, label: "Renewal Notice", value: formatDate(p.renewal_notice_date) },
    { icon: <Link2 className="w-3.5 h-3.5 text-gray-500" />, label: "Source", value: agreement.source_name ?? "—" },
    { icon: <Globe className="w-3.5 h-3.5 text-gray-400" />, label: "Language", value: agreement.languages?.join(", ").toUpperCase() ?? "—" },
  ];

  return (
    <TableRow className="bg-blue-50/40 hover:bg-blue-50/40 border-b-0">
      <TableCell colSpan={7} className="py-4 px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {items.map(({ icon, label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{icon}</div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-xs font-medium text-gray-800">{value}</p>
              </div>
            </div>
          ))}
        </div>
        {agreement._links?.document?.href && (
          <div className="mt-3 pt-3 border-t border-blue-100">
            <a href={agreement._links.document.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
              <ExternalLink className="w-3 h-3" /> View document
            </a>
          </div>
        )}
        {agreement.id && (
          <p className="mt-1 text-xs text-gray-400 font-mono">ID: {agreement.id}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Agreement row ────────────────────────────────────────────────────────────

function AgreementRow({ agreement }: { agreement: Agreement }) {
  const [expanded, setExpanded] = useState(false);
  const p = agreement.provisions ?? {};
  const currency = formatCurrency(p.total_agreement_value, p.total_agreement_value_currency_code);
  const soon = isEffectiveSoon(p.effective_date);
  const parties = (agreement.parties ?? []).map(partyName).filter(Boolean);

  return (
    <>
      <TableRow className="group cursor-pointer hover:bg-gray-50/80 transition-colors"
        onClick={() => setExpanded((e) => !e)}>
        <TableCell className="py-3 pr-3">
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate max-w-[230px]">
                {agreement.name ?? "Untitled Agreement"}
              </p>
              {agreement.source_name && (
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[230px]">
                  via {agreement.source_name}
                  {agreement.source_id && (
                    <span className="font-mono text-gray-300"> · {agreement.source_id.slice(0, 8)}…</span>
                  )}
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
      {expanded && <DetailRow agreement={agreement} />}
    </>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ agreements }: { agreements: Agreement[] }) {
  const counts = agreements.reduce<Record<string, number>>((acc, ag) => {
    const s = (ag.status ?? "unknown").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const totalValue = agreements.reduce((s, ag) => s + (ag.provisions?.total_agreement_value ?? 0), 0);

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {[
        { label: "Total", value: agreements.length, color: "text-gray-900" },
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
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [lastCall, setLastCall] = useState<LastCall | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limitFilter, setLimitFilter] = useState("25");
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");

  const handleLogout = async () => {
    await fetch(`${API_BASE}/docusign/auth/logout`, { method: "POST" });
    onLogout();
  };

  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, string> = {};
    if (search.trim()) params["search_text"] = search.trim();
    if (statusFilter !== "all") params["status"] = statusFilter;
    params["limit"] = limitFilter;

    const qs = new URLSearchParams(params);
    const url = `${API_BASE}/docusign/agreements${qs.toString() ? `?${qs}` : ""}`;

    const start = Date.now();
    try {
      const res = await fetch(url);
      const durationMs = Date.now() - start;
      const json = (await res.json()) as AgreementsResponse;

      setLastCall({
        method: "GET",
        url,
        params,
        status: res.status,
        responseBody: json,
        timestamp: new Date().toISOString(),
        durationMs,
      });

      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Status ${res.status}`);
        return;
      }

      setRawResponse(json);
      setAgreements(extractAgreements(json));
      setFetched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, limitFilter]);

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
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                Navigator Agreements
              </h1>
            </div>
            <p className="text-sm text-gray-500 ml-12">
              AI-extracted agreement metadata from Docusign Navigator
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
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 text-gray-600"
              onClick={() => setSettingsOpen(true)}
              title="Settings & Debug"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-gray-600 h-8"
              onClick={() => void handleLogout()}
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </Button>
          </div>
        </div>

        {fetched && !loading && agreements.length > 0 && <StatsBar agreements={agreements} />}

        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9 h-9 text-sm" placeholder="Search agreements..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void fetchAgreements(); }} />
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
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Voided">Voided</SelectItem>
                  <SelectItem value="Declined">Declined</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Per page</label>
              <Select value={limitFilter} onValueChange={setLimitFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="h-9 gap-2 bg-[#1B1E2E] hover:bg-[#2b3050] text-white"
              onClick={() => void fetchAgreements()} disabled={loading}>
              {loading
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              {fetched ? "Refresh" : "Fetch Agreements"}
            </Button>
          </div>

          {lastCall && !loading && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <code className="text-xs text-gray-400 font-mono">
                GET {lastCall.url.replace(API_BASE, "")}
              </code>
              <button
                onClick={() => { setSettingsOpen(true); }}
                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
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
                {loading ? "Loading..." : (
                  <>
                    <span className="font-semibold text-gray-900">{agreements.length}</span> agreement{agreements.length !== 1 ? "s" : ""}
                    {rawResponse?.total != null && <span className="text-gray-400"> of {rawResponse.total} total</span>}
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
            ) : agreements.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No agreements found</p>
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
                  {agreements.map((ag, idx) => <AgreementRow key={ag.id ?? idx} agreement={ag} />)}
                </TableBody>
              </Table>
            )}

            {(rawResponse?.cursor ?? rawResponse?.next_cursor) && !loading && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">More results available</span>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 max-w-[300px] truncate">
                  {String(rawResponse?.cursor ?? rawResponse?.next_cursor)}
                </code>
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

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        auth={auth}
        lastCall={lastCall}
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
