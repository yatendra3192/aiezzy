import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createServiceClient } from '@/lib/supabase/server';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    // Facebook/Meta provider (add when client ID is available)
    // FacebookProvider({ clientId: process.env.META_CLIENT_ID!, clientSecret: process.env.META_CLIENT_SECRET! }),
    // Apple provider (add when Apple Developer account is set up)
    // AppleProvider({ clientId: process.env.APPLE_ID!, clientSecret: process.env.APPLE_SECRET! }),

    // Email/password via Supabase Auth
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const supabase = createServiceClient();

        // Try to sign in with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error || !data.user) {
          // Supabase returns specific error for unverified emails
          if (error?.message?.includes('Email not confirmed')) {
            throw new Error('Please verify your email before signing in. Check your inbox for a verification link.');
          }
          return null;
        }

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
          image: data.user.user_metadata?.avatar_url,
        };
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') return true;

      // For OAuth providers: create/link Supabase Auth user
      if (user.email) {
        const supabase = createServiceClient();

        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === user.email);

        if (!existingUser) {
          // Create new Supabase Auth user (triggers profile creation)
          await supabase.auth.admin.createUser({
            email: user.email,
            email_confirm: true,
            user_metadata: {
              full_name: user.name,
              avatar_url: user.image,
              provider: account?.provider,
            },
          });
        }
      }

      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        // First sign-in: look up the Supabase user ID
        const supabase = createServiceClient();
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const supabaseUser = existingUsers?.users?.find(u => u.email === user.email);
        if (supabaseUser) {
          token.supabaseUserId = supabaseUser.id;
        }
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).supabaseUserId = token.supabaseUserId;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',
    error: '/',
  },

  session: {
    strategy: 'jwt',
  },
};
