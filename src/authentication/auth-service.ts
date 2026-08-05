import { supabase } from '@/lib/supabase';

export interface SignUpParams {
  email: string;
  password: string;
  username: string;
  displayName?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface AuthResult {
  error: string | null;
  needsEmailConfirmation: boolean;
}

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email before signing in.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return message;
}

export async function signUp({ email, password, username, displayName }: SignUpParams): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName ?? username,
      },
    },
  });

  if (error) {
    return { error: mapAuthError(error.message), needsEmailConfirmation: false };
  }

  return {
    error: null,
    needsEmailConfirmation: !data.session,
  };
}

export async function signIn({ email, password }: SignInParams): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: mapAuthError(error.message), needsEmailConfirmation: false };
  }

  if (data.user) {
    try {
      await supabase.rpc('record_login_event', { p_user_id: data.user.id });
    } catch {
      // Non-critical: don't block login if audit logging fails
    }
  }

  return {
    error: null,
    needsEmailConfirmation: !data.session,
  };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }
  return { error: null };
}

export async function updateNewPassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }
  return { error: null };
}

export async function resendVerificationEmail(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }
  return { error: null };
}
