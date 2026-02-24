import NextAuth, { NextAuthOptions, Session, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/shared/infrastructure/database/postgres";
import { createHash } from "crypto";
import { JWT } from "next-auth/jwt";

/** Minimal password verification using SHA-256 (replace with bcrypt if added as dep) */
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) return null;

        const inputHash = hashPassword(credentials.password);
        if (inputHash !== user.passwordHash) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),

    // TikTok OAuth stub — full PKCE flow handled in /api/accounts/connect
    {
      id: "tiktok",
      name: "TikTok",
      type: "oauth",
      authorization: {
        url: "https://www.tiktok.com/v2/auth/authorize/",
        params: { scope: "user.info.basic" },
      },
      token: "https://open.tiktokapis.com/v2/oauth/token/",
      userinfo: "https://open.tiktokapis.com/v2/user/info/",
      clientId: process.env.TIKTOK_CLIENT_ID,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.data?.user?.open_id ?? profile.sub,
          name: profile.data?.user?.display_name ?? "",
          email: "",
          image: profile.data?.user?.avatar_url ?? "",
        };
      },
    },

    // Instagram OAuth stub
    {
      id: "instagram",
      name: "Instagram",
      type: "oauth",
      authorization: {
        url: "https://api.instagram.com/oauth/authorize",
        params: { scope: "user_profile,user_media" },
      },
      token: "https://api.instagram.com/oauth/access_token",
      userinfo: "https://graph.instagram.com/me?fields=id,username",
      clientId: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username ?? "",
          email: "",
          image: "",
        };
      },
    },

    // YouTube (Google) OAuth stub
    {
      id: "youtube",
      name: "YouTube",
      type: "oauth",
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
      token: "https://oauth2.googleapis.com/token",
      userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    },
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token?.id && session.user) {
        (session.user as Session["user"] & { id: string }).id = token.id as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
