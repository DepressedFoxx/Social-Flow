import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { tokensEqual } from './auth.crypto';

export type GoogleProfile = { googleId: string; email: string; name: string };

@Injectable()
export class GoogleProvider {
  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  private client() {
    return new OAuth2Client({
      clientId: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      redirectUri: this.config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      transporterOptions: { timeout: 10_000 },
    });
  }

  authorizeUrl(state: string, challenge: string) {
    if (!this.enabled)
      throw new ServiceUnavailableException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Đăng nhập Google chưa sẵn sàng.',
      });
    return this.client().generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      nonce: state,
      code_challenge: challenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
    });
  }

  async profile(code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
    const client = this.client();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error('Missing Google identity token');
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    });
    const profile = ticket.getPayload();
    const payloadNonce = (profile as { nonce?: string } | undefined)?.nonce;
    if (
      !profile?.sub ||
      !profile.email ||
      profile.email_verified !== true ||
      !tokensEqual(payloadNonce, nonce)
    )
      throw new Error('Invalid Google identity');
    // Provider access/refresh/ID tokens are never persisted or sent to FE.
    return {
      googleId: profile.sub,
      email: profile.email.trim().toLowerCase(),
      name: profile.name || profile.email.split('@')[0],
    };
  }
}
