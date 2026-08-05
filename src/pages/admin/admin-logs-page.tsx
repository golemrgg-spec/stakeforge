import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAuditLogs, getAdminLogs } from '@/admin/admin-service';
import type { AuditLog, AdminLog } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AdminLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [audit, admin] = await Promise.all([
          getAuditLogs(100, 0),
          getAdminLogs(100, 0),
        ]);
        setAuditLogs(audit);
        setAdminLogs(admin);
      } catch (err) {
        console.error('Failed to load logs:', err);
        setAuditLogs([]);
        setAdminLogs([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="audit">
      <TabsList>
        <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        <TabsTrigger value="admin">Admin Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="audit">
        {auditLogs.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
            No audit logs yet
          </div>
        ) : (
          <div className="rounded border border-border/60 bg-surface-1">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2.5 border-b border-border/40 px-3 py-2 last:border-0 hover:bg-surface-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">{log.action}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px]">
                    {log.entity_type && (
                      <span className="text-muted-foreground">
                        {log.entity_type}
                        {log.entity_id && `: ${log.entity_id.slice(0, 8)}`}
                      </span>
                    )}
                  </p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <p className="text-[11px] text-muted-foreground break-all">
                      {JSON.stringify(log.metadata)}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{formatDate(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="admin">
        {adminLogs.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-[13px] text-muted-foreground">
            No admin logs yet
          </div>
        ) : (
          <div className="rounded border border-border/60 bg-surface-1">
            {adminLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2.5 border-b border-border/40 px-3 py-2 last:border-0 hover:bg-surface-2">
                <Badge variant="outline" className="shrink-0 text-[10px]">{log.action}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px]">
                    {log.entity_type && (
                      <span className="text-muted-foreground">
                        {log.entity_type}
                        {log.entity_id && `: ${log.entity_id.slice(0, 8)}`}
                      </span>
                    )}
                  </p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <p className="text-[11px] text-muted-foreground break-all">
                      {JSON.stringify(log.metadata)}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{formatDate(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
