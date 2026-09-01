import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, ChevronRight } from 'lucide-react';
import { adminSearchUsers, type SearchUserResult } from '@/admin/admin-service';
import { formatCoins } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { items } = await adminSearchUsers(
        search,
        roleFilter === 'all' ? undefined : roleFilter,
        statusFilter === 'all' ? undefined : statusFilter,
        100,
        0
      );
      setUsers(items);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [loadUsers]);

  return (
    <div className="space-y-3">
      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username, email, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[100px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="player">Player</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[110px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
          No users found
        </div>
      ) : (
        <div className="rounded border border-border/60 bg-surface-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Joined</span>
          </div>
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => navigate(`/admin/users/${user.id}`)}
                className="grid w-full grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-primary">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.username}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {user.email || user.display_name || 'No display name'}
                    </p>
                  </div>
                </div>
                <Badge variant={user.role === 'admin' ? 'gold' : 'secondary'}>
                  {user.role}
                </Badge>
                <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>
                  {user.status}
                </Badge>
                <span className="text-right font-mono text-[12px] text-gold">
                  {user.balance != null ? formatCoins(user.balance) : '—'}
                </span>
                <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
