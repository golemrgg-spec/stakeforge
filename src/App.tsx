import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/authentication/auth-context';
import { WalletProvider } from '@/wallet/wallet-context';
import { ProtectedRoute } from '@/authentication/protected-route';
import { AppLayout } from '@/layouts/app-layout';
import { AdminLayout } from '@/pages/admin/admin-layout';
import { LoginPage } from '@/pages/auth/login-page';
import { SignUpPage } from '@/pages/auth/signup-page';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password-page';
import { ResetPasswordPage } from '@/pages/auth/reset-password-page';
import { VerifyEmailPage } from '@/pages/auth/verify-email-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { GamesPage } from '@/pages/games-page';
import { MinesPage } from '@/pages/games/mines-page';
import { DicePage } from '@/pages/games/dice-page';
import { BlackjackPage } from '@/pages/games/blackjack-page';
import { CoinflipPage } from '@/pages/games/coinflip-page';
import { PlinkoPage } from '@/pages/games/plinko-page';
import { TowersPage } from '@/pages/games/towers-page';
import { RoulettePage } from '@/pages/games/roulette-page';
import { CaseBattlePage } from '@/pages/games/case-battle-page';
import { WalletPage } from '@/pages/wallet-page';
import { LeaderboardPage } from '@/pages/leaderboard-page';
import { SettingsPage } from '@/pages/settings-page';
import { NotificationsPage } from '@/pages/notifications-page';
import { AdminOverviewPage } from '@/pages/admin/admin-overview-page';
import { AdminUsersPage } from '@/pages/admin/admin-users-page';
import { AdminWalletsPage } from '@/pages/admin/admin-wallets-page';
import { AdminTransactionsPage } from '@/pages/admin/admin-transactions-page';
import { AdminLogsPage } from '@/pages/admin/admin-logs-page';
import { AdminGamesPage } from '@/pages/admin/admin-games-page';
import { AdminSettingsPage } from '@/pages/admin/admin-settings-page';
import { AdminUserDetailPage } from '@/pages/admin/admin-user-detail-page';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <AuthProvider>
      <WalletProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected app routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/mines" element={<MinesPage />} />
            <Route path="/games/dice" element={<DicePage />} />
            <Route path="/games/blackjack" element={<BlackjackPage />} />
            <Route path="/games/coinflip" element={<CoinflipPage />} />
            <Route path="/games/plinko" element={<PlinkoPage />} />
            <Route path="/games/towers" element={<TowersPage />} />
            <Route path="/games/roulette" element={<RoulettePage />} />
            <Route path="/games/case-battle" element={<CaseBattlePage />} />            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          {/* Admin routes */}
          <Route
            element={
              <ProtectedRoute requireAdmin>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="users/:userId" element={<AdminUserDetailPage />} />
              <Route path="wallets" element={<AdminWalletsPage />} />
              <Route path="transactions" element={<AdminTransactionsPage />} />
              <Route path="games" element={<AdminGamesPage />} />
              <Route path="logs" element={<AdminLogsPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
      </WalletProvider>
    </AuthProvider>
  );
}
