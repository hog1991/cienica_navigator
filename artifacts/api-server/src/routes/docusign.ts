import { Router, type IRouter, type Request, type Response } from "express";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const DOCUSIGN_AUTH_HOST = "https://account-d.docusign.com";
const DOCUSIGN_BASE_URL = "https://api-d.docusign.com/v1";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessTokenViaJWT(): Promise<string> {
  const clientId = process.env["DOCUSIGN_CLIENT_ID"];
  const userId = process.env["DOCUSIGN_USER_ID"];
  const privateKeyRaw = process.env["DOCUSIGN_PRIVATE_KEY"];

  if (!clientId || !userId || !privateKeyRaw) {
    throw new Error(
      "JWT auth requires DOCUSIGN_CLIENT_ID, DOCUSIGN_USER_ID, and DOCUSIGN_PRIVATE_KEY to be set",
    );
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);

  const assertion = jwt.sign(
    {
      iss: clientId,
      sub: userId,
      aud: "account-d.docusign.com",
      iat: now,
      exp: now + 3600,
      scope: "adm_store_unified_repo_read",
    },
    privateKey,
    { algorithm: "RS256" },
  );

  const response = await fetch(`${DOCUSIGN_AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Docusign JWT auth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  const directToken = process.env["DOCUSIGN_ACCESS_TOKEN"];
  if (directToken) {
    return directToken;
  }

  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  return getAccessTokenViaJWT();
}

function detectAuthMode(): "direct_token" | "jwt" | "unconfigured" {
  if (process.env["DOCUSIGN_ACCESS_TOKEN"]) return "direct_token";
  if (
    process.env["DOCUSIGN_CLIENT_ID"] &&
    process.env["DOCUSIGN_USER_ID"] &&
    process.env["DOCUSIGN_PRIVATE_KEY"]
  )
    return "jwt";
  return "unconfigured";
}

router.get("/docusign/auth-status", (_req: Request, res: Response) => {
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];
  const mode = detectAuthMode();

  res.json({
    mode,
    accountId: accountId ? `...${accountId.slice(-6)}` : null,
    configured: mode !== "unconfigured" && !!accountId,
    instructions:
      mode === "unconfigured"
        ? "Add either DOCUSIGN_ACCESS_TOKEN (for quick testing) or DOCUSIGN_CLIENT_ID + DOCUSIGN_USER_ID + DOCUSIGN_PRIVATE_KEY (for JWT auth)"
        : null,
  });
});

router.get(
  "/docusign/agreements",
  async (req: Request, res: Response) => {
    const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];

    if (!accountId) {
      res.status(500).json({ error: "DOCUSIGN_ACCOUNT_ID is not configured" });
      return;
    }

    const mode = detectAuthMode();
    if (mode === "unconfigured") {
      res.status(401).json({
        error: "Docusign authentication is not configured",
        instructions:
          "Set DOCUSIGN_ACCESS_TOKEN for quick testing, or set DOCUSIGN_CLIENT_ID + DOCUSIGN_USER_ID + DOCUSIGN_PRIVATE_KEY for JWT auth",
      });
      return;
    }

    try {
      const token = await getAccessToken();

      const params = new URLSearchParams();
      if (req.query["cursor"]) params.set("cursor", String(req.query["cursor"]));
      if (req.query["limit"]) params.set("limit", String(req.query["limit"]));
      if (req.query["from_date"]) params.set("from_date", String(req.query["from_date"]));
      if (req.query["to_date"]) params.set("to_date", String(req.query["to_date"]));
      if (req.query["status"]) params.set("status", String(req.query["status"]));
      if (req.query["type"]) params.set("type", String(req.query["type"]));
      if (req.query["search_text"]) params.set("search_text", String(req.query["search_text"]));
      if (req.query["order_by"]) params.set("order_by", String(req.query["order_by"]));
      if (req.query["order_direction"])
        params.set("order_direction", String(req.query["order_direction"]));

      const url = `${DOCUSIGN_BASE_URL}/accounts/${accountId}/agreements${params.toString() ? `?${params}` : ""}`;

      const apiRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
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
  },
);

export default router;
