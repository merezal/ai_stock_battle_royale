import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrentUserProvider } from './hooks/useCurrentUser';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Leaderboard } from './pages/Leaderboard';
import { Companies } from './pages/Companies';
import { CompanyDetail } from './pages/CompanyDetail';
import { UserProfile } from './pages/UserProfile';
import { Posts } from './pages/Posts';
import { Bot } from './pages/Bot';
import { Login } from './pages/Login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="companies" element={<Companies />} />
              <Route path="companies/:ticker" element={<CompanyDetail />} />
              <Route path="users/:username" element={<UserProfile />} />
              <Route path="posts" element={<Posts />} />
              <Route path="bot" element={<Bot />} />
              <Route path="login" element={<Login />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CurrentUserProvider>
    </QueryClientProvider>
  );
}

export default App;
