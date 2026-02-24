import { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/shared/infrastructure/database/postgres";

function toAdapterUser(user: {
  id: string;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
}): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
  };
}

/**
 * Minimal NextAuth adapter — only implements the methods needed
 * for the Email (magic link) provider with JWT session strategy.
 */
export function MagicLinkAdapter(): Adapter {
  return {
    async createUser(data: { email: string; name?: string | null; image?: string | null; emailVerified?: Date | null }) {
      const user = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          image: data.image,
          emailVerified: data.emailVerified,
        },
      });
      return toAdapterUser(user);
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },

    async updateUser({ id, ...data }) {
      const user = await prisma.user.update({ where: { id }, data });
      return toAdapterUser(user);
    },

    async createVerificationToken(data) {
      return prisma.verificationToken.create({ data });
    },

    async useVerificationToken({ identifier, token }) {
      try {
        return await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token } },
        });
      } catch {
        return null;
      }
    },

    // Stubs — unused with JWT strategy, but required by the Adapter interface
    async getUserByAccount() {
      return null;
    },
    async linkAccount() {},
    async createSession() {
      return { sessionToken: "", userId: "", expires: new Date() };
    },
    async getSessionAndUser() {
      return null;
    },
    async updateSession() {
      return null;
    },
    async deleteSession() {},
  };
}
