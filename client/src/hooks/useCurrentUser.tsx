import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUser } from '../api/client';
import type { User } from '../types';

interface CurrentUserContextType {
  userId: number | null;
  setUserId: (id: number | null) => void;
  user: User | null;
  isLoading: boolean;
}

const CurrentUserContext = createContext<CurrentUserContextType | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [userId, setUserIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem('currentUserId');
    return stored ? parseInt(stored) : null;
  });

  const setUserId = (id: number | null) => {
    if (userId !== null && userId !== id) {
      queryClient.removeQueries({ queryKey: ['user', userId] });
      queryClient.removeQueries({ queryKey: ['portfolio', userId] });
    }
    if (id !== null) {
      queryClient.removeQueries({ queryKey: ['user', id] });
      queryClient.removeQueries({ queryKey: ['portfolio', id] });
    }
    if (id) {
      localStorage.setItem('currentUserId', id.toString());
    } else {
      localStorage.removeItem('currentUserId');
    }
    setUserIdState(id);
  };

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId!),
    enabled: userId !== null,
    staleTime: 30_000,
  });

  return (
    <CurrentUserContext.Provider
      value={{
        userId,
        setUserId,
        user: user ?? null,
        isLoading,
      }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider');
  }
  return context;
}
