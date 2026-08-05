import { Settings, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function AdminSettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
      </div>
      <Badge variant="outline" className="gap-1">
        <Lock className="h-2.5 w-2.5" />
        Phase 2
      </Badge>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        Platform settings including house edge, RTP, deposit limits, and feature
        flags will be managed here.
      </p>
    </div>
  );
}
