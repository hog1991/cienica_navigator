import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Search,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Info,
} from "lucide-react";

const API_BASE = "/api";

interface Agreement {
  id: string;
  name?: string;
  status?: string;
  type?: string;
  created_date_time?: string;
  last_modified_date_time?: string;
  parties?: Array<{ name: string; role?: string }>;
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
  mode: "direct_token" | "jwt" | "unconfigured";
  accountId: string | null;
  configured: boolean;
  instructions: string | null;
}

function statusBadgeVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("active") || s.includes("complete") || s.includes("signed")) return "default";
  if (s.includes("draft") || s.includes("pending") || s.includes("sent")) return "secondary";
  if (s.includes("void") || s.includes("declined") || s.includes("expired")) return "destructive";
  return "outline";
}

function StatusIcon({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("active") || s.includes("complete") || s.includes("signed"))
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
  if (s.includes("draft") || s.includes("pending") || s.includes("sent"))
    return <Clock className="w-3.5 h-3.5 text-amber-500" />;
  if (s.includes("void") || s.includes("declined") || s.includes("expired"))
    return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  return <FileText className="w-3.5 h-3.5 text-gray-400" />;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function extractAgreements(data: AgreementsResponse): Agreement[] {
  return data.agreements ?? data.data ?? data.items ?? [];
}

function AuthBanner({ status }: { status: AuthStatus | null }) {
  if (!status) return null;

  if (status.configured) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 mb-5">
        <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
        <span>
          Authenticated via{" "}
          <strong>{status.mode === "direct_token" ? "Access Token" : "JWT Grant"}</strong>
          {status.accountId ? ` · Account ${status.accountId}` : ""}
        </span>
      </div>
    );
  }

  return (
    <Alert className="mb-5 border-amber-200 bg-amber-50">
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 font-semibold">Authentication not configured</AlertTitle>
      <AlertDescription className="text-amber-700 mt-1 space-y-2">
        <p>
          To fetch agreements, configure one of these authentication methods in your Replit Secrets:
        </p>
        <div className="mt-2 space-y-3">
          <div className="bg-white/70 rounded-md p-3 border border-amber-200">
            <p className="font-semibold text-amber-900 text-xs uppercase tracking-wide mb-1">
              Option A — Quick testing (Access Token)
            </p>
            <p className="text-xs">
              Add <code className="bg-amber-100 px-1 rounded font-mono">DOCUSIGN_ACCESS_TOKEN</code>{" "}
              — get a short-lived token from your Docusign developer sandbox using the OAuth Playground
              or Postman.
            </p>
          </div>
          <div className="bg-white/70 rounded-md p-3 border border-amber-200">
            <p className="font-semibold text-amber-900 text-xs uppercase tracking-wide mb-1">
              Option B — JWT Grant (Recommended for production)
            </p>
            <p className="text-xs mb-1">
              Add these three secrets to use server-to-server JWT authentication:
            </p>
            <ul className="text-xs space-y-0.5 font-mono">
              <li>
                <code className="bg-amber-100 px-1 rounded">DOCUSIGN_USER_ID</code> — your Docusign
                user API ID (from account settings)
              </li>
              <li>
                <code className="bg-amber-100 px-1 rounded">DOCUSIGN_PRIVATE_KEY</code> — RSA private
                key configured in your Integration Key
              </li>
            </ul>
            <p className="text-xs mt-1 text-amber-600">
              Note: You must also grant consent at:
              https://account-d.docusign.com/oauth/auth?response_type=code&scope=adm_store_unified_repo_read&client_id=YOUR_CLIENT_ID&redirect_uri=https://developers.docusign.com/platform/auth/authcode/
            </p>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function AgreementsList() {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [rawResponse, setRawResponse] = useState<AgreementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limitFilter, setLimitFilter] = useState("25");
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");

  useEffect(() => {
    fetch(`${API_BASE}/docusign/auth-status`)
      .then((r) => r.json())
      .then((data) => setAuthStatus(data as AuthStatus))
      .catch(() => {});
  }, []);

  const fetchAgreements = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search.trim()) params.set("search_text", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("limit", limitFilter);

    try {
      const res = await fetch(
        `${API_BASE}/docusign/agreements${params.toString() ? `?${params}` : ""}`,
      );
      const json = (await res.json()) as AgreementsResponse;

      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ?? `Request failed with status ${res.status}`;
        setError(msg);

        const details = (json as { instructions?: string }).instructions;
        if (details) setError(`${msg}\n\n${details}`);
        setLoading(false);
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-[#1B1E2E] flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Navigator Agreements
            </h1>
          </div>
          <p className="text-sm text-gray-500 ml-12">
            Fetch and browse agreements from the Docusign Navigator API
          </p>
        </div>

        <AuthBanner status={authStatus} />

        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9 h-9 text-sm"
                  placeholder="Search agreements..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void fetchAgreements();
                  }}
                />
              </div>
            </div>

            <div className="w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <span className="flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Status
                </span>
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
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

            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Limit</label>
              <Select value={limitFilter} onValueChange={setLimitFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="h-9 gap-2 bg-[#1B1E2E] hover:bg-[#2b3050] text-white"
              onClick={() => void fetchAgreements()}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {fetched ? "Refresh" : "Fetch Agreements"}
            </Button>
          </div>

          {/* Query params info */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-start gap-1.5 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Calls <code className="font-mono text-gray-500">GET /v1/accounts/&#123;accountId&#125;/agreements</code>{" "}
              · Supports: from_date, to_date, status, type, search_text, order_by, cursor pagination
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-line font-medium">{error}</AlertDescription>
          </Alert>
        )}

        {/* Results area */}
        {(fetched || loading) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="text-sm text-gray-500">
                {loading ? (
                  "Loading..."
                ) : (
                  <>
                    <span className="font-semibold text-gray-900">{agreements.length}</span>{" "}
                    agreement{agreements.length !== 1 ? "s" : ""}
                    {rawResponse?.total ? (
                      <span className="text-gray-400"> of {rawResponse.total} total</span>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
                <button
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "raw" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                  onClick={() => setViewMode("raw")}
                >
                  Raw JSON
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : viewMode === "raw" ? (
              <pre className="p-5 text-xs text-gray-700 overflow-auto max-h-[500px] bg-gray-50 font-mono leading-relaxed">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            ) : agreements.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No agreements found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Try adjusting your filters or check your Docusign account
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="text-xs font-semibold text-gray-600 w-[35%]">Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Type</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Parties</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Created</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Last Modified</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((agreement, idx) => (
                    <TableRow key={agreement.id ?? idx} className="group">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="font-medium text-sm text-gray-900 truncate max-w-[250px]">
                            {agreement.name ?? agreement.id ?? "Untitled"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {agreement.status ? (
                          <Badge
                            variant={statusBadgeVariant(agreement.status)}
                            className="gap-1 text-xs font-medium"
                          >
                            <StatusIcon status={agreement.status} />
                            {agreement.status}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{agreement.type ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        {agreement.parties && agreement.parties.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {agreement.parties.slice(0, 2).map((p, i) => (
                              <span key={i} className="text-xs text-gray-600 truncate max-w-[150px]">
                                {p.name}
                                {p.role ? (
                                  <span className="text-gray-400"> · {p.role}</span>
                                ) : null}
                              </span>
                            ))}
                            {agreement.parties.length > 2 && (
                              <span className="text-xs text-gray-400">
                                +{agreement.parties.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {formatDate(agreement.created_date_time)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {formatDate(agreement.last_modified_date_time)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {(rawResponse?.cursor ?? rawResponse?.next_cursor) && !loading && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  More results available — use cursor to paginate
                </span>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 max-w-[300px] truncate">
                  {String(rawResponse?.cursor ?? rawResponse?.next_cursor)}
                </code>
              </div>
            )}
          </div>
        )}

        {!fetched && !loading && !error && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-700 mb-1">Ready to fetch agreements</h3>
            <p className="text-sm text-gray-400">
              Apply filters above and click <strong>Fetch Agreements</strong> to retrieve data from
              the Docusign Navigator API.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
