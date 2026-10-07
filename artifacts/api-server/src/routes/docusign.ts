import express, { Router, type IRouter, type Request } from "express";
import { getToken } from "../lib/docusign-token.js";

const router: IRouter = Router();

const DOCUSIGN_BASE_URL = "https://api-d.docusign.com/v1";

router.get("/docusign/auth-status", (_req: Request, res: any) => {
  const token = getToken();
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  res.json({
    authenticated: !!token,
    accountId: accountId ? `...${accountId.slice(-6)}` : null,
    user: token?.userInfo ?? null,
  });
});

router.get("/docusign/debug-info", (_req: Request, res: any) => {
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
    scopes: [
      "adm_store_unified_repo_read",
      "adm_store_unified_repo_write",
      "public_dms_document_read",
      "document_uploader_write",
      "document_uploader_read",
    ],
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
router.get("/docusign/document", async (req: Request, res: any) => {
  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated", code: "unauthenticated" });
    return;
  }

  const query = req.query as Record<string, any>;
  const rawHref = query["href"];
  const href = typeof rawHref === "string" 
    ? rawHref 
    : Array.isArray(rawHref) && typeof rawHref[0] === "string" 
      ? rawHref[0] 
      : undefined;

  if (!href) {
    res.status(400).json({ error: "Missing href query param" });
    return;
  }

  const isAbsolute = href.startsWith("http");
  const fullUrl = isAbsolute
    ? href
    : `https://api-d.docusign.com/v1${href.startsWith("/") ? "" : "/"}${href}`;

  const rawFilename = query["filename"];
  const filename = typeof rawFilename === "string" 
    ? rawFilename 
    : Array.isArray(rawFilename) && typeof rawFilename[0] === "string" 
      ? rawFilename[0] 
      : "agreement.pdf";

  const isAzureBlob = fullUrl.includes(".blob.core.windows.net");
  const needsAuth = !isAzureBlob;

  const fetchHeaders: Record<string, string> = needsAuth
    ? { Authorization: `Bearer ${tokenRecord.accessToken}` }
    : {};

  try {
    const apiRes: any = await fetch(fullUrl, { headers: fetchHeaders });

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, fullUrl, needsAuth }, "Document download failed");
      res.status(apiRes.status).json({ error: "Document download failed", status: apiRes.status });
      return;
    }

    const contentType = apiRes.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = apiRes.headers.get("content-length");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "'")}"`);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const buffer = await apiRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    req.log.error({ err }, "Failed to download document");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/docusign/agreements/:agreementId", async (req: Request, res: any) => {
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

    const apiRes: any = await fetch(url, {
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

router.get("/docusign/agreements", async (req: Request, res: any) => {
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
    const q = req.query as Record<string, any>;
    const params = new URLSearchParams();

    const getStringParam = (val: unknown): string | undefined => {
      if (typeof val === "string") return val;
      if (Array.isArray(val) && typeof val[0] === "string") return val[0];
      return undefined;
    };

    const ctoken = getStringParam(q["ctoken"]);
    if (ctoken) params.set("ctoken", ctoken);

    const limit = getStringParam(q["limit"]);
    if (limit) params.set("limit", limit);

    const status = getStringParam(q["status"]);
    if (status) params.set("status", status);

    const reviewStatus = getStringParam(q["review_status"]);
    if (reviewStatus) params.set("review_status", reviewStatus);

    const title = getStringParam(q["title"]);
    if (title) params.set("title", title);

    const partiesName = getStringParam(q["parties.name_in_agreement"]);
    if (partiesName) params.set("parties.name_in_agreement", partiesName);

    const sourceName = getStringParam(q["source_name"]);
    if (sourceName) params.set("source_name", sourceName);

    const filterVal = getStringParam(q["$filter"]);
    if (filterVal) params.set("$filter", filterVal);

    const sort = getStringParam(q["sort"]);
    if (sort) params.set("sort", sort);

    const direction = getStringParam(q["direction"]);
    if (direction) params.set("direction", direction);

    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/agreements${params.toString() ? `?${params}` : ""}`;

    const apiRes: any = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const rawText = await apiRes.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, rawText }, "Docusign API error");
      res.status(apiRes.status).json({ error: typeof data === "string" ? data : "Docusign API error", details: data });
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Docusign agreements");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── Upload: Step 1 — create bulk upload job ─────────────────────────────────
router.post("/docusign/upload/start", async (req: Request, res: any) => {
  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  if (!accountId) {
    res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID not configured" });
    return;
  }

  const body = req.body as { count?: number };
  const count = Number(body.count ?? 0);
  if (!count || count < 1) {
    res.status(400).json({ error: "count must be >= 1" });
    return;
  }

  try {
    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/upload/jobs`;
    const apiRes: any = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expected_number_of_docs: count }),
    });

    const rawText = await apiRes.text();
    let data: unknown;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    if (!apiRes.ok) {
      req.log.warn({ status: apiRes.status, rawText, url }, "Bulk upload job creation failed");
      res.status(apiRes.status).json({
        error: `DocuSign API error (${apiRes.status})`,
        details: data,
        rawText,
      });
      return;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Upload start route crashed");
    res.status(500).json({ error: message });
  }
});

// ─── Upload: Step 2 — proxy PUT to Azure Blob SAS URL ────────────────────────
router.post(
  "/docusign/upload/file",
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req: Request, res: any) => {
    const query = req.query as Record<string, any>;
    const rawUploadUrl = query["upload_url"];
    const uploadUrl = typeof rawUploadUrl === "string" 
      ? rawUploadUrl 
      : Array.isArray(rawUploadUrl) && typeof rawUploadUrl[0] === "string" 
        ? rawUploadUrl[0] 
        : undefined;

    const rawFilename = query["filename"];
    const filename = typeof rawFilename === "string" 
      ? rawFilename 
      : Array.isArray(rawFilename) && typeof rawFilename[0] === "string" 
        ? rawFilename[0] 
        : undefined;

    if (!uploadUrl) {
      res.status(400).json({ error: "Missing upload_url" });
      return;
    }

    try {
      const blob = req.body as Buffer;
      const mimeType = (req.headers["x-file-type"] as string | undefined) ?? "application/pdf";

      const blobRes: any = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": mimeType,
          ...(filename ? { "x-ms-meta-filename": filename } : {}),
        },
        body: blob,
      });

      if (!blobRes.ok) {
        const text = await blobRes.text().catch(() => "");
        req.log.warn({ status: blobRes.status, uploadUrl }, "File upload to blob failed");
        res.status(blobRes.status).json({ error: "File upload failed", details: text });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  },
);

// ─── Upload: Step 3 — complete bulk upload job ───────────────────────────────
router.post("/docusign/upload/complete", async (req: Request, res: any) => {
  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  if (!accountId) {
    res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID not configured" });
    return;
  }

  const { job_id } = req.body as { job_id?: string };
  if (!job_id) {
    res.status(400).json({ error: "Missing job_id" });
    return;
  }

  try {
    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/upload/jobs/${encodeURIComponent(job_id)}/actions/complete`;
    const apiRes: any = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenRecord.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!apiRes.ok) {
      const data = await apiRes.json().catch(() => ({}));
      req.log.warn({ status: apiRes.status, data, job_id }, "Bulk upload complete failed");
      res.status(apiRes.status).json({ error: "Failed to complete upload job", details: data });
      return;
    }

    const data = await apiRes.json().catch(() => ({ ok: true }));
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── Delete agreement ─────────────────────────────────────────────────────────
router.delete("/docusign/agreements/:agreementId", async (req: Request, res: any) => {
  const tokenRecord = getToken();
  if (!tokenRecord) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  if (!accountId) {
    res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID not configured" });
    return;
  }

  const { agreementId } = req.params;

  try {
    const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/agreements/${encodeURIComponent(agreementId)}`;
    const apiRes: any = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenRecord.accessToken}` },
    });

    if (!apiRes.ok) {
      const data = await apiRes.json().catch(() => ({}));
      req.log.warn({ status: apiRes.status, data, agreementId }, "Agreement delete failed");
      res.status(apiRes.status).json({ error: "Delete failed", details: data });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;