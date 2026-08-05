import { NavLink, Outlet } from 'react-router-dom';
import {
  Users,
  Wallet,
  ArrowLeftRight,
  Gamepad2,
  Settings,
  ScrollText,
  BarChart3,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const adminNav = [
  { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { to: '/admin/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/admin/games', label: 'Games', icon: Gamepad2 },
  { to: '/admin/logs', label: 'Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Admin header */}
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-gold" />
        <h1 className="text-[15px] font-bold tracking-tight">Admin Panel</h1>
        <span className="text-[12px] text-muted-foreground">· Platform management</span>
      </div>

      {/* Compact admin sub-nav — horizontal on all sizes */}
      <nav className="flex items-center gap-0.5 overflow-x-auto border-b border-border/60 pb-px scrollbar-thin">
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex h-7 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium transition-colors duration-150',
                isActive
                  ? 'border-gold text-gold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )
            }
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
