import prisma from "../db/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

import { AuditService } from "./audit-service";

const SESSION_COOKIE_NAME = "mediaos_session";
const SESSION_EXPIRY_DAYS = 30;

export class AuthService {
  /**
   * Register a new user and bootstrap their default workspace and brand.
   */
  static async register(email: string, password: string, name: string) {
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw new Error("A user with this email address already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        role: "OWNER",
      },
    });

    // Create default workspace and member
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-ws-${Date.now().toString(36)}`;
    const workspace = await prisma.workspace.create({
      data: {
        name: `${name}'s Workspace`,
        slug,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    // Create default brand
    const brandSlug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-media`;
    await prisma.brand.create({
      data: {
        workspaceId: workspace.id,
        name: `${name} Media`,
        slug: brandSlug,
        tagline: "Autonomous Media Operations",
        description: "Operating system for technical creator production.",
        isDefault: true,
        identity: {
          create: {
            mission: "Publish high-signal, zero-slop technical insights backed by verifiable evidence.",
            vision: "Empower solo operators to out-execute multi-person editorial rooms.",
            positioning: "The authoritative voice in autonomous engineering.",
            values: "Evidence over confidence, Human in the loop, Rigorous technical precision",
          },
        },
        audience: {
          create: {
            targetAudience: "Senior engineers, technical founders, and solo creators.",
            painPoints: "Overwhelmed by AI slop, lack time to verify research, fragmented toolchains.",
            desires: "Clear mental models, actionable architectures, reproducible workflows.",
            objections: "AI content is usually superficial, inaccurate, or fabricated.",
          },
        },
        voice: {
          create: {
            tone: "Direct, technical, analytical, authoritative, grounded.",
            styleGuidelines: "Lead with the stakes. Use concrete nouns and architecture diagrams. Never use empty buzzwords.",
            forbiddenWords: "delve, game-changer, revolutionary, supercharge, leverage, unleash",
            signaturePhrases: "Build systems, not scripts; Evidence over confidence; The Centaur Operator",
          },
        },
      },
    });

    return user;
  }

  /**
   * Authenticate user credentials and issue a session.
   */
  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                brands: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    const primaryWorkspaceId = user.memberships[0]?.workspaceId;

    if (!isValid) {
      if (primaryWorkspaceId) {
        try {
          await AuditService.log({
            workspaceId: primaryWorkspaceId,
            userId: user.id,
            action: "AUTH_LOGIN_FAILED",
            entityType: "User",
            entityId: user.id,
            details: { email: user.email, reason: "INVALID_PASSWORD" },
          });
        } catch {
          // Non-blocking audit log
        }
      }
      throw new Error("Invalid email or password.");
    }

    // Create database session token
    const token = `sess_${crypto.randomUUID()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Log successful login
    if (primaryWorkspaceId) {
      try {
        await AuditService.log({
          workspaceId: primaryWorkspaceId,
          userId: user.id,
          action: "AUTH_LOGIN_SUCCESS",
          entityType: "User",
          entityId: user.id,
          details: { email: user.email },
        });
      } catch {
        // Non-blocking audit log
      }
    }

    // Set HTTP-only cookie
    try {
      cookies().set({
        name: SESSION_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: expiresAt,
        path: "/",
      });
    } catch {
      // In non-HTTP context (e.g. unit tests, background tasks), cookie store is not available
    }

    return user;
  }

  /**
   * Terminate current session.
   */
  static async logout(sessionToken?: string) {
    let token = sessionToken;
    if (!token) {
      try {
        token = cookies().get(SESSION_COOKIE_NAME)?.value;
      } catch {
        // Non-HTTP context
      }
    }

    if (token) {
      try {
        const session = await prisma.session.findUnique({
          where: { token },
          include: {
            user: {
              include: { memberships: true },
            },
          },
        });
        if (session) {
          const workspaceId = session.user.memberships[0]?.workspaceId;
          if (workspaceId) {
            await AuditService.log({
              workspaceId,
              userId: session.userId,
              action: "AUTH_LOGOUT",
              entityType: "User",
              entityId: session.userId,
              details: { email: session.user.email },
            });
          }
        }
      } catch {
        // Non-blocking audit log
      }

      await prisma.session.deleteMany({
        where: { token },
      });

      try {
        cookies().delete(SESSION_COOKIE_NAME);
      } catch {
        // Non-HTTP context
      }
    }
  }

  /**
   * Retrieve current authenticated user and their active workspace/brand.
   */
  static async getCurrentUser() {
    let token: string | undefined;
    try {
      token = cookies().get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // Non-HTTP context
    }
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                workspace: {
                  include: {
                    brands: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    const user = session.user;
    const defaultWorkspace = user.memberships[0]?.workspace || null;
    const defaultBrand = defaultWorkspace?.brands.find((b) => b.isDefault) || defaultWorkspace?.brands[0] || null;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      workspace: defaultWorkspace,
      brand: defaultBrand,
    };
  }
}
