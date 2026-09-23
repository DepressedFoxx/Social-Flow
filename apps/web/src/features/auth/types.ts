export type AuthSession = {
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
  csrfToken: string;
  expiresAt: string;
};

export const sessionKey = ['auth', 'session'] as const;
