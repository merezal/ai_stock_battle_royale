import { Server } from 'socket.io';
import { IncomingMessage, ServerResponse } from 'http';
import { Server as HttpServer } from 'http';
import { verifyToken } from './auth';
import { logger } from './logger';

let io: Server | null = null;

export function initSocketServer(httpServer: HttpServer<typeof IncomingMessage, typeof ServerResponse>): Server {
  const corsOrigin = process.env.CORS_ORIGIN;

  io = new Server(httpServer, {
    cors: corsOrigin
      ? { origin: corsOrigin, methods: ['GET', 'POST'] }
      : { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }
    const data = socket.data as { userId: number; username: string; isAdmin: boolean };
    data.userId = payload.userId;
    data.username = payload.username;
    data.isAdmin = payload.isAdmin ?? false;
    next();
  });

  io.on('connection', (socket) => {
    const { userId, username, isAdmin } = socket.data as { userId: number; username: string; isAdmin: boolean };
    logger.debug('Socket connected', { userId, username, isAdmin, socketId: socket.id });

    socket.join(`user:${userId}`);
    if (isAdmin) {
      socket.join('admin');
    }

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { userId, username, reason });
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO server not initialized');
  return io;
}
