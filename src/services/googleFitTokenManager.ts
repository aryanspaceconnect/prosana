import type { Request, Response, RequestHandler } from 'express';
import type { GoogleOAuthTokenRecord } from '../types.js';

// 5-minute safety threshold: proactively refresh before token runs out
export const SAFETY_BUFFER_MS = 5 * 60 * 1000; 

// In-memory token store on the backend for quick retrieval and renewal tracking
const serverTokenStore = new Map<string, GoogleOAuthTokenRecord>();

/**
 * Checks whether an OAuth token is expired or within the safety buffer window.
 */
export function isTokenExpired(expiresAt?: number, safetyBufferMs: number = SAFETY_BUFFER_MS): boolean {
  if (!expiresAt || typeof expiresAt !== 'number') {
    return false; // If no expiration is recorded, rely on live API response
  }
  return Date.now() >= (expiresAt - safetyBufferMs);
}

/**
 * Retrieves the cached token record for a specific user.
 */
export function getStoredToken(userId: string): GoogleOAuthTokenRecord | undefined {
  return serverTokenStore.get(userId);
}

/**
 * Saves or updates a user's Google OAuth token record in server memory.
 */
export function saveStoredToken(record: GoogleOAuthTokenRecord): void {
  serverTokenStore.set(record.userId, {
    ...record,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Uses a Google OAuth refresh_token to obtain a brand new access_token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId?: string,
  clientSecret?: string
): Promise<{
  accessToken: string;
  expiresIn: number;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}> {
  const effectiveClientId = clientId || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const effectiveClientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';

  if (!refreshToken) {
    throw new Error('Refresh token is required to refresh Google OAuth access token');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
  if (effectiveClientId) params.append('client_id', effectiveClientId);
  if (effectiveClientSecret) params.append('client_secret', effectiveClientSecret);

  console.log(`[Google Token Manager] Refreshing access token via Google OAuth token endpoint...`);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Google Token Manager] Token refresh failed (${response.status}):`, errorBody);
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const expiresIn = data.expires_in || 3600; // default 1 hour
  const expiresAt = Date.now() + (expiresIn * 1000);

  console.log(`[Google Token Manager] Successfully refreshed access token. New validity: ${Math.round(expiresIn / 60)} minutes.`);

  return {
    accessToken: data.access_token,
    expiresIn,
    expiresAt,
    scope: data.scope,
    tokenType: data.token_type || 'Bearer'
  };
}

/**
 * Exchanges an OAuth 2.0 authorization code for access_token and refresh_token.
 */
export async function exchangeAuthCodeForTokens(
  code: string,
  redirectUri: string,
  clientId?: string,
  clientSecret?: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}> {
  const effectiveClientId = clientId || process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const effectiveClientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);
  if (effectiveClientId) params.append('client_id', effectiveClientId);
  if (effectiveClientSecret) params.append('client_secret', effectiveClientSecret);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google authorization code exchange failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const expiresIn = data.expires_in || 3600;
  const expiresAt = Date.now() + (expiresIn * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn,
    expiresAt,
    scope: data.scope,
    tokenType: data.token_type || 'Bearer'
  };
}

/**
 * Central Token Validation & Auto-Renewal Engine
 * Checks timestamp, executes refresh if needed, and returns a verified active access token.
 */
export async function getOrRenewValidToken(
  userId: string,
  incomingAccessToken?: string,
  incomingRefreshToken?: string,
  incomingExpiresAt?: number
): Promise<{
  accessToken?: string;
  refreshed: boolean;
  expiresAt: number;
  error?: string;
}> {
  // Retrieve existing stored token or construct from incoming parameters
  let existing = serverTokenStore.get(userId);

  // If new credentials were provided in the request, update our in-memory record
  if (incomingAccessToken) {
    const expiresAt = incomingExpiresAt || (existing?.expiresAt) || (Date.now() + 3600 * 1000);
    existing = {
      userId,
      accessToken: incomingAccessToken,
      refreshToken: incomingRefreshToken || existing?.refreshToken,
      expiresAt,
      status: 'valid',
      updatedAt: new Date().toISOString()
    };
    serverTokenStore.set(userId, existing);
  }

  if (!existing || !existing.accessToken) {
    return {
      refreshed: false,
      expiresAt: 0,
      error: 'No OAuth token found. Please connect Google Fit.'
    };
  }

  // 1. Check if token is still valid (outside the 5-minute safety buffer)
  const expired = isTokenExpired(existing.expiresAt, SAFETY_BUFFER_MS);

  if (!expired) {
    return {
      accessToken: existing.accessToken,
      refreshed: false,
      expiresAt: existing.expiresAt
    };
  }

  // 2. Token is expired or expiring soon - attempt refresh using refresh_token
  const refreshToken = existing.refreshToken || incomingRefreshToken;

  if (refreshToken) {
    try {
      const refreshedData = await refreshGoogleAccessToken(refreshToken);
      
      const updatedRecord: GoogleOAuthTokenRecord = {
        userId,
        accessToken: refreshedData.accessToken,
        refreshToken,
        expiresAt: refreshedData.expiresAt,
        scope: refreshedData.scope,
        tokenType: refreshedData.tokenType,
        lastRefreshedAt: new Date().toISOString(),
        status: 'valid'
      };

      serverTokenStore.set(userId, updatedRecord);

      return {
        accessToken: refreshedData.accessToken,
        refreshed: true,
        expiresAt: refreshedData.expiresAt
      };
    } catch (refreshErr: any) {
      console.error(`[Google Token Manager] Refresh token failed for user ${userId}:`, refreshErr?.message);
      existing.status = 'error';
      existing.errorMessage = refreshErr?.message;
      serverTokenStore.set(userId, existing);

      return {
        accessToken: existing.accessToken, // fallback to existing in case Google API still accepts it
        refreshed: false,
        expiresAt: existing.expiresAt,
        error: `Failed to refresh OAuth token: ${refreshErr?.message}`
      };
    }
  }

  // 3. No refresh token available and token is expired
  return {
    accessToken: existing.accessToken,
    refreshed: false,
    expiresAt: existing.expiresAt,
    error: 'OAuth access token expired and no refresh_token is configured. User re-authentication required.'
  };
}

export interface ValidTokenContext {
  accessToken: string;
  userId: string;
  expiresAt: number;
  refreshed: boolean;
}

/**
 * Express Higher-Order Wrapper Function for all Google Fit / Health Data Fetching Endpoints.
 * Validates expiration timestamp and performs automated renewal before dispatching the health fetch.
 */
export function withValidGoogleToken(
  handler: (req: Request, res: Response, tokenContext: ValidTokenContext) => Promise<any>
): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.body?.userId || req.query?.userId || req.params?.userId || req.headers['x-user-id']) as string;
      const authHeader = req.headers['authorization'];
      const incomingAccessToken = (req.body?.accessToken || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined)) as string | undefined;
      const incomingRefreshToken = (req.body?.refreshToken || req.headers['x-refresh-token']) as string | undefined;
      const incomingExpiresAt = req.body?.expiresAt ? Number(req.body.expiresAt) : undefined;

      if (!userId) {
        res.status(400).json({
          error: "userId is required for health data endpoints",
          code: "MISSING_USER_ID"
        });
        return;
      }

      // Check timestamp and automatically refresh if required
      const tokenResult = await getOrRenewValidToken(userId, incomingAccessToken, incomingRefreshToken, incomingExpiresAt);

      if (!tokenResult.accessToken) {
        res.status(401).json({
          error: tokenResult.error || "Google Fit OAuth access token is expired or missing. Please re-authenticate.",
          code: "TOKEN_EXPIRED_REAUTH_REQUIRED",
          expiresAt: tokenResult.expiresAt
        });
        return;
      }

      // If token was refreshed, send headers back to keep client in sync
      if (tokenResult.refreshed) {
        res.setHeader('x-refreshed-access-token', tokenResult.accessToken);
        res.setHeader('x-token-expires-at', tokenResult.expiresAt.toString());
      }

      const tokenContext: ValidTokenContext = {
        accessToken: tokenResult.accessToken,
        userId,
        expiresAt: tokenResult.expiresAt,
        refreshed: tokenResult.refreshed
      };

      // Execute the wrapped health endpoint handler
      await handler(req, res, tokenContext);
    } catch (err: any) {
      console.error("[withValidGoogleToken Wrapper Exception]", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal error processing health data request",
          details: err?.message
        });
      }
    }
  };
}
