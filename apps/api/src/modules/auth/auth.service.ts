import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { hashToken, pkceChallenge, randomToken } from './auth.crypto';
import { GoogleProvider, type GoogleProfile } from './google.provider';
import { SESSION_MAX_AGE, STATE_MAX_AGE, type SessionView } from './auth.types';
import { hashPassword, verifyPassword } from './password';
import type { RegisterDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleProvider,
  ) {}

  async begin() {
    const state = randomToken();
    const verifier = randomToken();
    const url = this.google.authorizeUrl(state, pkceChallenge(verifier));
    await this.prisma.oAuthAttempt.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.prisma.oAuthAttempt.create({
      data: {
        stateHash: hashToken(state),
        verifier,
        expiresAt: new Date(Date.now() + STATE_MAX_AGE),
      },
    });
    return { state, url };
  }

  async consumeAttempt(state: string) {
    const stateHash = hashToken(state);
    const attempt = await this.prisma.oAuthAttempt.findUnique({ where: { stateHash } });
    const consumed = await this.prisma.oAuthAttempt.deleteMany({
      where: { stateHash, expiresAt: { gt: new Date() } },
    });
    if (!attempt || consumed.count !== 1) throw this.unauthorized();
    return attempt.verifier;
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    userId: string,
    previousToken?: string,
  ) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);
    if (previousToken)
      await tx.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } });
    await tx.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    await tx.session.create({
      data: { tokenHash: hashToken(token), csrfToken: randomToken(), userId, expiresAt },
    });
    return { token, expiresAt };
  }

  private workspace(name: string) {
    return {
      create: {
        name: name + ' workspace',
        channels: {
          create: [
            { platform: 'FACEBOOK' as const, name: 'Facebook mẫu' },
            { platform: 'INSTAGRAM' as const, name: 'Instagram mẫu' },
          ],
        },
      },
    };
  }

  async register(dto: RegisterDto, previousToken?: string) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            name: dto.name,
            passwordHash,
            workspace: this.workspace(dto.name),
          },
        });
        return this.createSession(tx, user.id, previousToken);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS',
          message: 'Email đã được sử dụng. Hãy đăng nhập bằng phương thức đã đăng ký.',
        });
      throw error;
    }
  }

  async login(dto: LoginDto, previousToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await verifyPassword(dto.password, user?.passwordHash);
    if (!user || !valid)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng.',
      });
    return this.prisma.$transaction((tx) =>
      this.createSession(tx, user.id, previousToken),
    );
  }

  async signInGoogle(profile: GoogleProfile, previousToken?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          let user = await tx.user.findUnique({ where: { googleId: profile.googleId } });
          if (!user) {
            if (await tx.user.findUnique({ where: { email: profile.email } }))
              throw new ConflictException({
                code: 'ACCOUNT_EXISTS',
                message:
                  'Email này đã có tài khoản. Hãy dùng phương thức đăng nhập ban đầu.',
              });
            user = await tx.user.create({
              data: { ...profile, workspace: this.workspace(profile.name) },
            });
          }
          return this.createSession(tx, user.id, previousToken);
        });
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        )
          continue;
        throw error;
      }
    }
    throw new Error('Sign-in transaction failed');
  }

  async current(token: unknown): Promise<SessionView> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw this.unauthorized();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: {
            workspace: { include: { channels: { orderBy: { platform: 'asc' } } } },
          },
        },
      },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.workspace)
      throw this.unauthorized();
    const { user } = session;
    const workspace = user.workspace!;
    return {
      user: { id: user.id, email: user.email, name: user.name },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        timezone: workspace.timezone,
        channels: workspace.channels.map(({ id, name, platform, isMock }) => ({
          id,
          name,
          platform,
          isMock,
        })),
      },
      expiresAt: session.expiresAt.toISOString(),
      csrfToken: session.csrfToken,
    };
  }

  logout(tokenHash: string) {
    return this.prisma.session.deleteMany({ where: { tokenHash } });
  }
  private unauthorized() {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Phiên đăng nhập không còn hiệu lực.',
    });
  }
}
