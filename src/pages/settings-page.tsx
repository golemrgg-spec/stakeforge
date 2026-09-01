import { useState, type FormEvent } from 'react';
import { User, Mail, Calendar, Shield, Save, AlertCircle } from 'lucide-react';
import { useAuth } from '@/authentication/auth-context';
import { updateProfile } from '@/features/profile/profile-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';

export function SettingsPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);

    try {
      await updateProfile(profile.id, {
        display_name: displayName,
        avatar_url: avatarUrl || null,
      });
      await refreshProfile();
      toast({ title: 'Settings saved', description: 'Your profile has been updated.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-[15px] font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile section — flat, no card */}
      <div className="space-y-3 border-b border-border/60 pb-4">
        <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <User className="h-3.5 w-3.5 text-primary" />
          Profile
        </h2>
        <form onSubmit={handleSave} className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={profile?.username || ''}
                disabled
                className="bg-surface-2/50"
              />
              <p className="text-[11px] text-muted-foreground">Username cannot be changed</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your display name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <Button type="submit" disabled={saving} size="sm">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Account section — inline metadata, no card */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" />
          Account
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2.5 border-l-2 border-border/40 px-3 py-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="truncate text-[13px] font-medium">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-l-2 border-border/40 px-3 py-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Role</p>
              <Badge variant={profile?.role === 'admin' ? 'gold' : 'secondary'}>
                {profile?.role || 'player'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-l-2 border-border/40 px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Member Since</p>
              <p className="text-[13px] font-medium">
                {profile ? new Date(profile.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
