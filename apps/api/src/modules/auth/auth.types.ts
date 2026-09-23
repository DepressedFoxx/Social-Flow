import type { Request } from 'express';

export const SESSION_COOKIE = 'sf_session';
export const STATE_COOKIE = 'sf_oauth_state';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const STATE_MAX_AGE = 10 * 60 * 1000;

export type SessionView = {
  user: { id: string; email: string; name: string };
  workspace: {
    id: string;
    name: string;
    timezone: string;
    channels: {
      id: string;
      name: string;
      platform: string;
      isMock: boolean;
      isActive: boolean;
    }[];
  };
  expiresAt: string;
  csrfToken: string;
};

export type AuthRequest = Request & { auth: SessionView; sessionHash: string };
