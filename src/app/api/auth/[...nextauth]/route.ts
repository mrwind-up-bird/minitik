import NextAuth, { NextAuthOptions, Session, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@/shared/infrastructure/database/postgres";
import { createHash } from "crypto";
import { JWT } from "next-auth/jwt";
import { Resend } from "resend";
import { MagicLinkAdapter } from "@/shared/infrastructure/auth/magic-link-adapter";

/** Minimal password verification using SHA-256 (replace with bcrypt if added as dep) */
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  adapter: MagicLinkAdapter(),

  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER ?? "smtp://localhost",
      from: process.env.EMAIL_FROM ?? "Minitik <onboarding@resend.dev>",
      async sendVerificationRequest({ identifier: email, url }) {
        const fromAddress = process.env.EMAIL_FROM ?? "Minitik <onboarding@resend.dev>";
        const { data, error } = await resend.emails.send({
          from: fromAddress,
          to: email,
          subject: "Sign in to Minitik",
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;padding:40px 20px">
              <h1 style="font-size:24px;font-weight:700;color:#7c3aed;margin-bottom:8px">minitik</h1>
              <p style="color:#525252;font-size:16px;line-height:24px;margin-bottom:24px">
                Click the button below to sign in to your account. This link expires in 24 hours.
              </p>
              <a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">
                Sign in to Minitik
              </a>
              <p style="color:#a3a3a3;font-size:12px;margin-top:32px">
                If you didn't request this email, you can safely ignore it.
              </p>
            </div>
          `,
        });

        if (error) {
          console.error("Resend error:", JSON.stringify(error));
          throw new Error(`Failed to send magic link: ${error.message}`);
        }
        console.log("Magic link email sent:", data?.id, "to:", email);
      },
    }),

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
    verifyRequest: "/login?verify=1",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
