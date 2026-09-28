import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import dbConnect from "@/lib/db/mongoose";
import { AuditLog } from "@/lib/db/models";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const allowedEmails = (process.env.ADMIN_EMAIL || "").split(",").map(e => e.trim());

      if (allowedEmails.includes(user.email)) {
        dbConnect().then(async () => {
          await AuditLog.create({
            adminEmail: user.email,
            action: "LOGIN",
            targetType: "AUTH",
          });
        }).catch(console.error);

        return true;
      } else {
        console.warn(`Unauthorized login attempt by: ${user.email}`);
        return false;
      }
    },
    async session({ session, token }) {
      session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "default_secret_for_development_only_please_change",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
