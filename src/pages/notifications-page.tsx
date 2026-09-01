import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNotifications } from '@/features/notifications/use-notifications';
import { cn } from '@/lib/utils';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationsPage() {
  const { notifications, loading, markAllAsRead, markAsRead } = useNotifications();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold tracking-tight">Notifications</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Account activity and alerts</p>
        </div>
        {notifications.some((n) => n.read_at === null) && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Bell className="h-6 w-6 opacity-40" />
          <p className="text-[13px]">No notifications yet</p>
        </div>
      ) : (
        <div className="rounded border border-border/60 bg-surface-1">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => notification.read_at === null && markAsRead(notification.id)}
              className={cn(
                'flex w-full items-center gap-2.5 border-b border-border/40 px-3 py-2.5 text-left transition-colors duration-150 last:border-0 hover:bg-surface-2',
                notification.read_at === null && 'bg-primary/[0.04]'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  notification.read_at === null ? 'bg-primary' : 'bg-transparent'
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{notification.title}</p>
                {notification.body && (
                  <p className="truncate text-[12px] text-muted-foreground">{notification.body}</p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatRelativeTime(notification.created_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
