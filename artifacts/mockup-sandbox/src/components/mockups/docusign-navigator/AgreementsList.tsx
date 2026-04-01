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
  FileText,
  Search,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  LogOut,
  User,
  ExternalLink,
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
  authenticated: boolean;
  accountId: string | null;
  user?: { name?: string; email?: string } | null;
}

function statusBadgeVariant(
  status?: string,
): "default" | "secondary" | "destructive" | "outline" {
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

function ConnectScreen({
  onSuccess,
  accountId,
}: {
  onSuccess: () => void;
  accountId: string | null;
}) {
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "docusign-auth-success") {
        setConnecting(false);
        onSuccess();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSuccess]);

  const handleConnect = () => {
    setConnecting(true);
    const w = 520;
    const h = 660;
    const left = Math.max(0, (screen.width - w) / 2);
    const top = Math.max(0, (screen.height - h) / 2);
    const popup = window.open(
      `${API_BASE}/docusign/auth/start`,
      "docusign-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`,
    );
    popupRef.current = popup;

    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        setConnecting(false);
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1B1E2E] flex items-center justify-center mx-auto mb-6">
          <FileText className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Docusign Navigator
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Connect your Docusign account to browse and search agreements
          from the Navigator API.
        </p>

        {accountId && (
          <div className="mb-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Account {accountId} configured
          </div>
        )}

        <Button
          size="lg"
          className="w-full gap-2 bg-[#1B1E2E] hover:bg-[#2b3050] text-white h-11 text-sm font-medium"
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Waiting for authorization...
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Connect with Docusign
            </>
          )}
        </Button>

        {connecting && (
          <p className="mt-3 text-xs text-gray-400">
            A popup opened for you to sign in. Allow popups if blocked.
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-gray-100 text-left space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            What this does
          </p>
          <ul className="space-y-1.5">
            {[
              "Opens a secure Docusign login popup",
              "Requests read access to your Navigator agreements",
              "Exchanges your authorization for an access token",
              "Lets you fetch and search all your agreements",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AgreementsView({
  auth,
  onLogout,
}: {
  auth: AuthStatus;
  onLogout: () => void;
}) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [rawResponse, setRawResponse] = useState<AgreementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

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
        const errJson = json as { error?: string };
        setError(errJson.error ?? `Request failed with status ${res.status}`);
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

  const displayName = auth.user?.name ?? auth.user?.email ?? null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
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
              Browse and search agreements via the Docusign Navigator API
            </p>
          </div>

          {/* User + Logout */}
          <div className="flex items-center gap-3">
            {displayName && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <span className="hidden sm:block">{displayName}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-gray-600 h-8"
              onClick={() => void handleLogout()}
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Search
              </label>
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
                  <Filter className="w-3 h-3" />
                  Status
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Limit
              </label>
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

          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 font-mono">
            GET /v1/accounts/{auth.accountId}/agreements
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mb-5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-medium">{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {(fetched || loading) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <span className="text-sm text-gray-500">
                {loading ? (
                  "Loading..."
                ) : (
                  <>
                    <span className="font-semibold text-gray-900">{agreements.length}</span>{" "}
                    agreement{agreements.length !== 1 ? "s" : ""}
                    {rawResponse?.total != null && (
                      <span className="text-gray-400"> of {rawResponse.total} total</span>
                    )}
                  </>
                )}
              </span>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {(["table", "raw"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${viewMode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {m === "raw" ? "Raw JSON" : "Table"}
                  </button>
                ))}
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
                  Try adjusting your filters or check your Docusign Navigator account
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="text-xs font-semibold text-gray-600 w-[35%]">Name</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Type</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Parties</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Created</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600">Modified</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements.map((ag, idx) => (
                    <TableRow key={ag.id ?? idx} className="group">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="font-medium text-sm text-gray-900 truncate max-w-[240px]">
                            {ag.name ?? ag.id ?? "Untitled"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {ag.status ? (
                          <Badge
                            variant={statusBadgeVariant(ag.status)}
                            className="gap-1 text-xs font-medium"
                          >
                            <StatusIcon status={ag.status} />
                            {ag.status}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">{ag.type ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        {ag.parties && ag.parties.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {ag.parties.slice(0, 2).map((p, i) => (
                              <span key={i} className="text-xs text-gray-600 truncate max-w-[140px]">
                                {p.name}
                                {p.role && (
                                  <span className="text-gray-400"> · {p.role}</span>
                                )}
                              </span>
                            ))}
                            {ag.parties.length > 2 && (
                              <span className="text-xs text-gray-400">
                                +{ag.parties.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {formatDate(ag.created_date_time)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600">
                          {formatDate(ag.last_modified_date_time)}
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
              Apply filters above and click{" "}
              <strong className="text-gray-600">Fetch Agreements</strong> to load data from
              the Docusign Navigator API.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!auth?.authenticated) {
    return (
      <ConnectScreen
        accountId={auth?.accountId ?? null}
        onSuccess={() => void checkAuth()}
      />
    );
  }

  return (
    <AgreementsView
      auth={auth}
      onLogout={() => setAuth({ authenticated: false, accountId: auth.accountId })}
    />
  );
}
