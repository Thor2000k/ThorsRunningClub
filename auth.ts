import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/security";
import { localMode, localUser, localUserByEmail, testLoginEnabled } from "@/lib/local";

const allowTestLogin = testLoginEnabled;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || (localMode ? "local-development-only-secret-change-me" : undefined),
  adapter: DrizzleAdapter(db),
  session: { strategy: allowTestLogin ? "jwt" : "database" },
  providers: [
    Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }),
    ...(allowTestLogin ? [Credentials({
      id: "test-credentials",
      name: "Local test login",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;
        const user = localMode ? await localUserByEmail(email) : (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
        if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
        return { id: user.id, name: user.name, email: user.email, image: (user as any).image };
      },
    })] : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, user, token }) {
      const id = user?.id || token.sub;
      if (session.user && id) {
        session.user.id = id;
        const profile = localMode ? await localUser(id) : (await db.select({ alias: users.alias }).from(users).where(eq(users.id, id)).limit(1))[0];
        session.user.alias = profile?.alias || user?.name || session.user.name || session.user.email?.split("@")[0] || "Runner";
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id && user.email) {
        await db.update(users).set({
          name: user.name || undefined,
          image: user.image || undefined,
          alias: user.name || user.email.split("@")[0],
        }).where(and(eq(users.id, user.id), eq(users.alias, "")));
      }
      return true;
    },
  },
  pages: { signIn: "/" },
});
