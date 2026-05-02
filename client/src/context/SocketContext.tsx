import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Socket } from 'socket.io-client';
import { createSocket, disconnectSocket } from '../lib/socket';
import type { BotActivityLog, BotStatus, AdminLog } from '../api/client';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export function SocketProvider({
  userId,
  children,
}: {
  userId: number | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!userId || !token) {
      disconnectSocket();
      socketRef.current = null;
      return;
    }

    const socket = createSocket(token);
    socketRef.current = socket;

    // ── Invalidation events ────────────────────────────────────

    socket.on('companies:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      // Also invalidate any open company detail query
      queryClient.invalidateQueries({ queryKey: ['company'] });
    });

    socket.on('orderbook:updated', ({ ticker }: { ticker?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      if (ticker) {
        queryClient.invalidateQueries({ queryKey: ['orderbook', ticker] });
      }
      queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
    });

    socket.on('leaderboard:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    });

    socket.on('portfolio:updated', ({ userId: uid, username }: { userId: number; username: string }) => {
      // Own portfolio (Dashboard / Portfolio page)
      queryClient.invalidateQueries({ queryKey: ['portfolio', uid] });
      queryClient.invalidateQueries({ queryKey: ['user', uid] });
      // UserProfile page (anyone viewing this user's profile)
      queryClient.invalidateQueries({ queryKey: ['userProfile', username] });
      queryClient.invalidateQueries({ queryKey: ['transactions', username] });
      queryClient.invalidateQueries({ queryKey: ['portfolioHistory', username] });
      // CompanyDetail majority-shareholder check
      queryClient.invalidateQueries({ queryKey: ['portfolio', 'username', username] });
    });

    socket.on('transactions:new', (_: { ticker?: string }) => {
      // Invalidates ['transactions'], ['transactions', ticker], ['transactions', username] — all via prefix match
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    });

    socket.on('posts:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    });

    // ── Full-payload pushes ────────────────────────────────────

    socket.on('bot:status', (status: BotStatus) => {
      queryClient.setQueryData(['botStatus'], status);
    });

    socket.on('bot:log', (log: BotActivityLog & { userId?: number }) => {
      if (log.userId !== undefined && log.userId !== userId) return;
      queryClient.setQueryData<BotActivityLog[]>(
        ['botLogs', userId],
        (prev) => {
          if (!prev) return [log];
          return [log, ...prev].slice(0, 40);
        }
      );
    });

    socket.on('admin:log', (log: AdminLog) => {
      queryClient.setQueryData<AdminLog[]>(
        ['adminLogs'],
        (prev) => {
          if (!prev) return [log];
          return [log, ...prev].slice(0, 100);
        }
      );
    });

    socket.on('bot:perspective', ({ userId: uid, perspective }: { userId: number; username: string; perspective: string }) => {
      queryClient.setQueryData<{ promptId: number | null; promptText: string; perspective: string | null; isActive: boolean; version: number; lastModified?: string }>(
        ['botPrompt', uid],
        (prev) => prev ? { ...prev, perspective } : prev
      );
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [userId, queryClient]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
