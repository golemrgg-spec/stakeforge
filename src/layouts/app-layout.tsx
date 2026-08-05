import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home,
  Bomb,
  Rocket,
  Dice5,
  Club,
  CircleSlash,
  TowerControl,
  Package,
  ArrowUpCircle,
  Disc,
  Coins,
  Bell,
  Settings,
  LogOut,
  Shield,
  Menu,
  X,
  Plus,
  Wallet as WalletIcon,
  Trophy,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/authentication/auth-context';
import { useWallet } from '@/wallet/wallet-context';
import { useNotifications } from '@/features/notifications/use-notifications';
import { signOut } from '@/authentication/auth-service';
import { getActiveAnnouncements, type Announcement } from '@/features/announcements/announcement-service';
import { cn, formatCoins } from '@/lib/utils';
import { DepositModal } from '@/wallet/deposit-modal';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

type GameEntry = {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: string;
};

const games: GameEntry[] = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/games/mines', label: 'Mines', icon: Bomb },
  { to: '/games/crash', label: 'Crash', icon: Rocket },
  { to: '/games/dice', label: 'Dice', icon: Dice5 },
  { to: '/games/blackjack', label: 'Blackjack', icon: Club },
  { to: '/games', label: 'Plinko', icon: CircleSlash, badge: 'soon' },
  { to: '/games', label: 'Towers', icon: TowerControl, badge: 'soon' },
  { to: '/games', label: 'Cases', icon: Package, badge: 'soon' },
  { to: '/games', label: 'Upgrader', icon: ArrowUpCircle, badge: 'soon' },
  { to: '/games', label: 'Roulette', icon: Disc, badge: 'soon' },
  { to: '/games', label: 'Coinflip', icon: Coins, badge: 'soon' },
];

function formatBalance(amount: number): string {
  return formatCoins(amount);
}

function SidebarNavLink({
  item,
  onClick,
}: {
  item: GameEntry;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard'}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group relative flex h-[68px] w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground',
          isActive && 'text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-7 -translate-y-1/2 w-[2px] rounded-r bg-primary" />
          )}
          {isActive && (
            <span className="absolute inset-0 bg-primary/[0.06]" />
          )}
          <item.icon
            className={cn(
              'relative h-[18px] w-[18px] transition-transform duration-150 group-hover:scale-110',
              isActive && 'text-primary'
            )}
          />
          <span
            className={cn(
              'relative text-[10px] font-medium leading-none tracking-tight',
              isActive && 'text-foreground'
            )}
          >
            {item.label}
          </span>
          {item.badge && (
            <span className="absolute right-1.5 top-1.5 text-[8px] uppercase tracking-wide text-muted-foreground/60">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Ticker({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;

  return (
    <div className="relative hidden flex-1 items-center justify-center overflow-hidden md:flex">
      <div className="flex w-full max-w-2xl items-center">
        <span className="mr-2 flex h-5 items-center rounded bg-gold/15 px-1.5 text-[10px] font-bold uppercase tracking-wider text-gold">
          Live
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex w-max animate-ticker gap-10 whitespace-nowrap text-[12px] text-muted-foreground">
            {[...announcements, ...announcements].map((ann, i) => (
              <span key={`${ann.id}-${i}`} className="flex items-center gap-2">
                <Disc className="h-3 w-3 text-primary/70" />
                {ann.message}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { profile, user } = useAuth();
  const { wallet } = useWallet();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [depositOpen, setDepositOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    getActiveAnnouncements().then(setAnnouncements);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initials = (profile?.display_name || profile?.username || user?.email || '?')
    .charAt(0)
    .toUpperCase();

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      {/* Fixed left game sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border/60 bg-surface-1"
        style={{ width: 'var(--nav-side-w)' }}
      >
        <div
          className="flex shrink-0 items-center justify-center border-b border-border/60"
          style={{ height: 'var(--nav-top-h)' }}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15">
            <Disc className="h-4 w-4 text-primary" />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-1 scrollbar-thin">
          {games.map((game) => (
            <SidebarNavLink key={game.label} item={game} />
          ))}
        </nav>
        <div className="shrink-0 border-t border-border/60 py-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'group relative flex h-[56px] w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground',
                isActive && 'text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-[2px] rounded-r bg-primary" />
                )}
                <Settings className="h-[16px] w-[16px]" />
                <span className="text-[10px] font-medium leading-none">Settings</span>
              </>
            )}
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'group relative flex h-[56px] w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground',
                  isActive && 'text-gold'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 w-[2px] rounded-r bg-gold" />
                  )}
                  <Shield className="h-[16px] w-[16px]" />
                  <span className="text-[10px] font-medium leading-none">Admin</span>
                </>
              )}
            </NavLink>
          )}
        </div>
      </aside>

      {/* Main column: top bar + content */}
      <div
        className="flex h-screen flex-col"
        style={{ marginLeft: 'var(--nav-side-w)' }}
      >
        {/* Top navigation */}
        <header
          className="fixed inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-border/60 bg-surface-1/95 px-3 backdrop-blur-sm"
          style={{ height: 'var(--nav-top-h)', marginLeft: 'var(--nav-side-w)' }}
        >
          {/* Left: logo wordmark */}
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
                  <div className="flex items-center gap-2">
                    <Disc className="h-5 w-5 text-primary" />
                    <span className="text-sm font-bold tracking-tight">Stakeforge</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <nav className="flex flex-col py-2">
                  {games.map((game) => (
                    <SidebarNavLink
                      key={game.label}
                      item={game}
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <span className="text-[15px] font-bold tracking-tight">Stakeforge</span>
          </div>

          {/* Center: ticker */}
          <Ticker announcements={announcements} />

          {/* Right: wallet, deposit, notifications, profile */}
          <div className="flex items-center gap-1.5">
            {wallet && (
              <button
                onClick={() => navigate('/wallet')}
                className="flex h-8 items-center gap-1.5 rounded border border-border/60 bg-surface-2 px-2.5 transition-colors duration-150 hover:border-primary/40 hover:bg-surface-3"
              >
                <WalletIcon className="h-3.5 w-3.5 text-gold" />
                <span className="font-mono text-[13px] font-semibold text-gold">
                  {formatBalance(wallet.balance)}
                </span>
              </button>
            )}
            <Button
              size="sm"
              className="h-8 gap-1"
              onClick={() => setDepositOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Deposit
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              onClick={() => navigate('/notifications')}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-1.5 rounded border border-border/60 bg-surface-2 pl-1 pr-2 transition-colors duration-150 hover:border-primary/40 hover:bg-surface-3">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-[12px] font-medium sm:inline-block">
                    {profile?.username}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-[13px] font-medium">{profile?.display_name || profile?.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/wallet')}>
                  <WalletIcon className="mr-2 h-3.5 w-3.5" />
                  Wallet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/leaderboard')}>
                  <Trophy className="mr-2 h-3.5 w-3.5" />
                  Leaderboard
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/admin')}>
                      <Shield className="mr-2 h-3.5 w-3.5 text-gold" />
                      Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto scrollbar-thin"
          style={{ marginTop: 'var(--nav-top-h)' }}
        >
          <div className="min-h-full p-4">
            <Outlet />
          </div>
        </main>
      </div>

      <DepositModal open={depositOpen} onOpenChange={setDepositOpen} />
    </div>
  );
}
