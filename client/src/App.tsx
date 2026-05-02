import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrentUserProvider, useCurrentUser } from './hooks/useCurrentUser';
import { SocketProvider } from './context/SocketContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Leaderboard } from './pages/Leaderboard';
import { UserProfile } from './pages/UserProfile';
import { Posts } from './pages/Posts';
import { Bot } from './pages/Bot';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { Portfolio } from './pages/Portfolio';

function CompanyRedirect() {
  const { ticker } = useParams<{ ticker: string }>();
  return <Navigate to={`/?entity=${ticker}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { userId } = useCurrentUser();

  if (!userId) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="companies/:ticker" element={<CompanyRedirect />} />
        <Route path="users/:username" element={<UserProfile />} />
        <Route path="posts" element={<Posts />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="bot" element={<Bot />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function AppWithSocket() {
  const { userId } = useCurrentUser();
  return (
    <SocketProvider userId={userId}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SocketProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider>
        <AppWithSocket />
      </CurrentUserProvider>
    </QueryClientProvider>
  );
}

export default App;
