import { Router, type IRouter, type Request, type Response } from "express";
import { getToken } from "../lib/docusign-token.js";

const router: IRouter = Router();

const DOCUSIGN_BASE_URL = "https://api-d.docusign.com/v1";

router.get("/docusign/auth-status", (_req: Request, res: Response) => {
  const token = getToken();
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  res.json({
    authenticated: !!token,
    accountId: accountId ? `...${accountId.slice(-6)}` : null,
    user: token?.userInfo ?? null,
  });
});

router.get("/docusign/debug-info", (_req: Request, res: Response) => {
  const token = getToken();
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  const clientId = process.env["DOCUSIGN_CLIENT_ID"];
  const hasDirectToken = !!process.env["DOCUSIGN_ACCESS_TOKEN"];
  const hasJwtKey = !!process.env["DOCUSIGN_PRIVATE_KEY"];
  const hasUserId = !!process.env["DOCUSIGN_USER_ID"];

  const authMode = hasDirectToken
    ? "direct_token"
    : hasJwtKey && hasUserId
      ? "jwt"
      : token
        ? "authorization_code"
        : "unconfigured";

  res.json({
    account: {
      accountId: accountId ?? null,
      accountName: token?.userInfo?.accountName ?? null,
      clientId: clientId ? `${clientId.slice(0, 8)}…` : null,
      user: token?.userInfo ?? null,
      tokenExpires: token ? new Date(token.expiresAt).toISOString() : null,
    },
    auth: {
      mode: authMode,
      authenticated: !!token,
    },
    scopes: ["adm_store_unified_repo_read", "public_dms_document_read"],
    api: {
      baseUrl: "https://api-d.docusign.com/v1",
      environment: "sandbox (developer)",
      agreementsEndpoint: accountId
        ? `https://api-d.docusign.com/v1/accounts/${accountId}/agreements`
        : "https://api-d.docusign.com/v1/accounts/{accountId}/agreements",
      authEndpoint: "https://account-d.docusign.com/oauth/auth",
      tokenEndpoint: "https://account-d.docusign.com/oauth/token",
    },
  });
});

// Download proxy — fetches a Navigator document using the stored Bearer token
// and streams it back to the browser as a file download.
// Usage: GET /api/docusign/document?href=<relative-or-absolute-path>&filename=<name>
router.get("/docusign/document", async (req: Request, res: Response) => {
  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated", code: "unauthenticated" });
    return;
  }

  const href = req.query["href"] as string | undefined;
  if (!href) {
    res.status(400).json({ error: "Missing href query param" });
    return;
  }

  // Build full URL — href may be relative (e.g. /accounts/…) or absolute
  const isAbsolute = href.startsWith("http");
  const fullUrl = isAbsolute
    ? href
    : `https://api-d.docusign.com/v1${href.startsWith("/") ? "" : "/"}${href}`;

  const filename = (req.query["filename"] as string | undefined) ?? "agreement.pdf";

  // Determine whether to send the Bearer token:
  // - DocuSign-hosted endpoints (*.docusign.net, api-d.docusign.com, etc.) → always send token
  // - Azure Blob SAS URLs (*.blob.core.windows.net) → no auth (signature is in the URL)
  // - Relative paths → always send token (it's a Navigator API path)
  const isAzureBlob = fullUrl.includes(".blob.core.windows.net");
  const needsAuth = !isAzureBlob;

  const fetchHeaders: Record<string, string> = needsAuth
    ? { Authorization: `Bearer ${tokenRecord.accessToken}` }
    : {};

  try {
    const apiRes = await fetch(fullUrl, { headers: fetchHeaders });

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, fullUrl, needsAuth }, "Document download failed");
      res.status(apiRes.status).json({ error: "Document download failed", status: apiRes.status });
      return;
    }

    const contentType = apiRes.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = apiRes.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "'")}"`);
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buffer = await apiRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    req.log.error({ err }, "Failed to download document");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/docusign/agreements/:agreementId", async (req: Request, res: Response) => {
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  const { agreementId } = req.params;

  if (!accountId) {
    res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID is not configured" });
    return;
  }

  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated", code: "unauthenticated" });
    return;
  }

  try {
    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/agreements/${encodeURIComponent(agreementId)}`;

    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = (await apiRes.json()) as unknown;

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, data }, "Docusign getAgreement error");
      res.status(apiRes.status).json({ error: "Docusign API error", details: data });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Docusign agreement");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/docusign/agreements", async (req: Request, res: Response) => {
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];

  if (!accountId) {
    res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID is not configured" });
    return;
  }

  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({
      error: "Not authenticated",
      code: "unauthenticated",
    });
    return;
  }

  try {
    const params = new URLSearchParams();
    // Pagination — Navigator API uses 'ctoken' for continuation, not 'cursor'
    if (req.query["ctoken"]) params.set("ctoken", String(req.query["ctoken"]));
    if (req.query["limit"]) params.set("limit", String(req.query["limit"]));
    // Direct filter params
    if (req.query["status"]) params.set("status", String(req.query["status"]));
    if (req.query["review_status"]) params.set("review_status", String(req.query["review_status"]));
    if (req.query["title"]) params.set("title", String(req.query["title"]));
    if (req.query["parties.name_in_agreement"])
      params.set("parties.name_in_agreement", String(req.query["parties.name_in_agreement"]));
    // OData $filter string (built by the client)
    if (req.query["$filter"]) params.set("$filter", String(req.query["$filter"]));
    // Sort
    if (req.query["sort"]) params.set("sort", String(req.query["sort"]));
    if (req.query["direction"]) params.set("direction", String(req.query["direction"]));

    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/agreements${params.toString() ? `?${params}` : ""}`;

    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = (await apiRes.json()) as unknown;

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, data }, "Docusign API error");
      res.status(apiRes.status).json({ error: "Docusign API error", details: data });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Docusign agreements");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
