import { Router, type IRouter, type Request, type Response } from "express";
import { setToken, getToken, clearToken } from "../lib/docusign-token.js";

const router: IRouter = Router();

const DOCUSIGN_AUTH_HOST = "https://account-d.docusign.com";
const SCOPE = "adm_store_unified_repo_read";

function getRedirectUri(req: Request): string {
  const domains = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (domains) return `https://${domains}/api/docusign/auth/callback`;
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/docusign/auth/callback`;
}

router.get("/docusign/auth/start", (req: Request, res: Response) => {
  const clientId = process.env["DOCUSIGN_CLIENT_ID"];
  if (!clientId) {
    res.status(500).send("DOCUSIGN_CLIENT_ID is not configured");
    return;
  }

  const redirectUri = getRedirectUri(req);
  const state = Math.random().toString(36).slice(2);

  const params = new URLSearchParams({
    response_type: "code",
    scope: SCOPE,
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(`${DOCUSIGN_AUTH_HOST}/oauth/auth?${params}`);
});

router.get("/docusign/auth/callback", async (req: Request, res: Response) => {
  const { code, error, error_description } = req.query as Record<string, string>;

  if (error) {
    req.log.warn({ error, error_description }, "Docusign OAuth error");
    res.send(callbackPage("error", null, `${error}: ${error_description ?? "Unknown error"}`));
    return;
  }

  if (!code) {
    res.send(callbackPage("error", null, "No authorization code received"));
    return;
  }

  const clientId = process.env["DOCUSIGN_CLIENT_ID"];
  const clientSecret = process.env["DOCUSIGN_CLIENT_SECRET"];

  if (!clientId || !clientSecret) {
    res.send(callbackPage("error", null, "Missing Docusign credentials on server"));
    return;
  }

  const redirectUri = getRedirectUri(req);
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const tokenRes = await fetch(`${DOCUSIGN_AUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      req.log.error({ status: tokenRes.status, text }, "Token exchange failed");
      res.send(callbackPage("error", null, `Token exchange failed (${tokenRes.status}): ${text}`));
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      expires_in: number;
    };

    let userInfo: StoredToken["userInfo"] = undefined;
    try {
      const userRes = await fetch(`${DOCUSIGN_AUTH_HOST}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const u = (await userRes.json()) as {
          name?: string;
          email?: string;
          sub?: string;
        };
        userInfo = { name: u.name, email: u.email, sub: u.sub };
      }
    } catch {
    }

    setToken({
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in - 60) * 1000,
      userInfo,
    });

    req.log.info({ user: userInfo?.email }, "Docusign OAuth success");
    res.send(callbackPage("success", userInfo?.name ?? userInfo?.email ?? "Connected", null));
  } catch (err) {
    req.log.error({ err }, "OAuth callback error");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.send(callbackPage("error", null, msg));
  }
});

router.post("/docusign/auth/logout", (_req: Request, res: Response) => {
  clearToken();
  res.json({ ok: true });
});

router.get("/docusign/auth/status", (_req: Request, res: Response) => {
  const token = getToken();
  const accountId = process.env["DOCUSIGN_ACCOUNT_ID"];

  if (!token) {
    res.json({
      authenticated: false,
      accountId: accountId ? `...${accountId.slice(-6)}` : null,
    });
    return;
  }

  res.json({
    authenticated: true,
    accountId: accountId ? `...${accountId.slice(-6)}` : null,
    user: token.userInfo ?? null,
    expiresAt: token.expiresAt,
  });
});

interface StoredToken {
  userInfo?: { name?: string; email?: string; sub?: string };
}

function callbackPage(status: "success" | "error", userName: string | null, error: string | null): string {
  const isSuccess = status === "success";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${isSuccess ? "Connected!" : "Auth Failed"} — Docusign Navigator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f9fafb;
    }
    .card {
      background: white; border-radius: 16px; padding: 40px;
      text-align: center; max-width: 380px; width: 90%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { font-size: 20px; font-weight: 600; color: #111827; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; line-height: 1.5; }
    .error-box {
      background: #fef2f2; border: 1px solid #fecaca;
      border-radius: 8px; padding: 12px; margin-top: 16px;
      font-size: 12px; color: #dc2626; text-align: left;
      font-family: monospace; word-break: break-all;
    }
    .close-btn {
      margin-top: 20px; padding: 10px 24px;
      background: ${isSuccess ? "#1B1E2E" : "#ef4444"}; color: white;
      border: none; border-radius: 8px; font-size: 14px;
      cursor: pointer; font-weight: 500;
    }
    .close-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "✅" : "❌"}</div>
    <h2>${isSuccess ? "Connected to Docusign!" : "Authentication Failed"}</h2>
    <p>${isSuccess ? `Signed in${userName ? ` as <strong>${userName}</strong>` : ""}. You can close this window.` : "Something went wrong during authentication."}</p>
    ${error ? `<div class="error-box">${error}</div>` : ""}
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
  <script>
    ${isSuccess ? `
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'docusign-auth-success' }, '*');
      }
    } catch(e) {}
    setTimeout(() => window.close(), 1500);
    ` : ""}
  </script>
</body>
</html>`;
}

export default router;
