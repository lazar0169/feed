import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  currentUser = signal<User | null>(null);
  currentProfile = signal<UserProfile | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor(private router: Router) {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );

    // Listen to auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.currentUser.set(session?.user ?? null);
      this.isAuthenticated.set(!!session?.user);

      if (session?.user) {
        this.loadUserProfile(session.user.id);
      } else {
        this.currentProfile.set(null);
      }
    });

    // Check for existing session on init
    this.checkSession();
  }

  private async checkSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) {
      this.currentUser.set(session.user);
      this.isAuthenticated.set(true);
      await this.loadUserProfile(session.user.id);
    }
  }

  private async loadUserProfile(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      this.currentProfile.set(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  async signUp(username: string, email: string, password: string) {
    try {
      // 1. Sign up with Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from signup');

      // 2. Create user profile with username
      const { error: profileError } = await this.supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          username,
          email,
          created_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      return { success: true, data: authData };
    } catch (error: any) {
      console.error('Signup error:', error);
      return { success: false, error: error.message };
    }
  }

  async signIn(username: string, password: string) {
    try {
      // First, get the email from username (case-insensitive)
      const { data: profileData, error: profileError } = await this.supabase
        .from('profiles')
        .select('email')
        .ilike('username', username)
        .single();

      if (profileError || !profileData) {
        console.error('Profile lookup error:', profileError);
        console.log('Searching for username:', username);
        // Debug: Let's see what profiles exist
        const { data: allProfiles } = await this.supabase
          .from('profiles')
          .select('username');
        console.log('Available usernames:', allProfiles);
        throw new Error('Invalid username or password');
      }

      console.log('Found email for username:', profileData.email);

      // Sign in with email and password
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: profileData.email,
        password,
      });

      if (error) {
        console.error('Supabase auth error:', error);
        throw new Error('Invalid username or password');
      }

      await this.loadUserProfile(data.user.id);
      this.router.navigate(['/today']);

      return { success: true, data };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message || 'Invalid username or password' };
    }
  }

  async signOut() {
    try {
      // Check if there's an active session before trying to sign out
      const { data: { session } } = await this.supabase.auth.getSession();

      if (session) {
        const { error } = await this.supabase.auth.signOut();
        if (error) throw error;
      }

      // Always clear local state and navigate, even if no session
      this.currentUser.set(null);
      this.currentProfile.set(null);
      this.isAuthenticated.set(false);
      this.router.navigate(['/login']);

      return { success: true };
    } catch (error: any) {
      console.error('Sign out error:', error);

      // Even if sign out fails, clear local state and redirect
      this.currentUser.set(null);
      this.currentProfile.set(null);
      this.isAuthenticated.set(false);
      this.router.navigate(['/login']);

      return { success: false, error: error.message };
    }
  }

  async resetPassword(email: string) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Password reset error:', error);
      return { success: false, error: error.message };
    }
  }

  async updatePassword(newPassword: string) {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Update password error:', error);
      return { success: false, error: error.message };
    }
  }

  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }

  async getSession(): Promise<Session | null> {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }
}
