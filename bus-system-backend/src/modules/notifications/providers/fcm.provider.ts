import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FcmSendResult {
  sent: boolean;
  reason?: string;
}

@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);
  private cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const projectId = this.configService.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FCM_PRIVATE_KEY');
    return Boolean(projectId && clientEmail && privateKey);
  }

  async sendPush(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<FcmSendResult> {
    if (!this.isConfigured()) {
      this.logger.debug(
        `FCM not configured; skipping push to token=${fcmToken.slice(0, 12)}...`,
      );
      return { sent: false, reason: 'FCM_NOT_CONFIGURED' };
    }

    try {
      const accessToken = await this.getGoogleAccessToken();
      const projectId = this.configService.get<string>('FCM_PROJECT_ID');
      const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title, body },
            data,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { sent: false, reason: `FCM HTTP ${res.status}: ${text}` };
      }

      return { sent: true };
    } catch (err) {
      return {
        sent: false,
        reason: err instanceof Error ? err.message : 'FCM push error',
      };
    }
  }

  private async getGoogleAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAtMs > now + 60_000) {
      return this.cachedAccessToken.token;
    }

    const clientEmail = this.configService.get<string>('FCM_CLIENT_EMAIL')!;
    const privateKey = (this.configService.get<string>('FCM_PRIVATE_KEY') ?? '').replace(
      /\\n/g,
      '\n',
    );
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;

    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp,
        iat,
      }),
    ).toString('base64url');

    const signingInput = `${header}.${claim}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(privateKey, 'base64url');
    const assertion = `${signingInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!res.ok) {
      throw new Error(`OAuth token exchange failed with ${res.status}`);
    }

    const json = (await res.json()) as { access_token: string; expires_in?: number };
    this.cachedAccessToken = {
      token: json.access_token,
      expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  }
}
