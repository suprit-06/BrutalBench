import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        // The GitHub provider profile type isn't perfectly typed out of the box in next-auth, so we cast if needed.
        // @ts-ignore
        token.handle = profile?.login;
        await supabase.from('users').upsert({
          id: token.sub,
          // @ts-ignore
          github_handle: profile?.login,
          // @ts-ignore
          avatar_url: profile?.avatar_url,
          access_token: account.access_token
        }, { onConflict: 'id' });
      }
      return token;
    },
    async session({ session, token }) {
      // @ts-ignore
      session.accessToken = token.accessToken as string;
      // @ts-ignore
      if(!session.user) session.user = {};
      // @ts-ignore
      session.user.handle = token.handle as string;
      // @ts-ignore
      session.user.id = token.sub as string;
      return session;
    }
  }
});

export { handler as GET, handler as POST };
