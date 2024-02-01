import { env } from "@/env";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth({
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
});
