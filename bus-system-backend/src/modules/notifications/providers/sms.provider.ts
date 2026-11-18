import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  sent: boolean;
  provider: 'log' | 'http';
  errorMessage?: string;
}

@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async sendSms(
    phone: string,
    message: string,
    options?: { sensitive?: boolean },
  ): Promise<SmsSendResult> {
    const provider =
      this.configService.get<string>('SMS_PROVIDER') === 'http'
        ? 'http'
        : 'log';

    if (provider === 'http') {
      const url = this.configService.get<string>('SMS_HTTP_URL');
      const apiKey = this.configService.get<string>('SMS_API_KEY') ?? '';
      const senderId =
        this.configService.get<string>('SMS_SENDER_ID') ?? 'MASAR';

      if (!url) {
        this.logger.warn('SMS_PROVIDER=http but SMS_HTTP_URL is missing');
        return {
          sent: false,
          provider: 'http',
          errorMessage: 'SMS_HTTP_URL not configured',
        };
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ to: phone, message, senderId }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return {
            sent: false,
            provider: 'http',
            errorMessage: `HTTP ${res.status}: ${text}`,
          };
        }

        return { sent: true, provider: 'http' };
      } catch (err) {
        return {
          sent: false,
          provider: 'http',
          errorMessage: err instanceof Error ? err.message : 'SMS request failed',
        };
      }
    }

    const nodeEnv =
      this.configService.get<string>('nodeEnv') ??
      this.configService.get<string>('NODE_ENV');
    const isProduction = nodeEnv === 'production';
    const displayMessage =
      options?.sensitive && isProduction ? '[REDACTED_OTP_MESSAGE]' : message;
    this.logger.log(`[SMS:log] to=${phone} body=${displayMessage}`);
    return { sent: true, provider: 'log' };
  }
}
