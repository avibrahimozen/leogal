import { io, type Socket } from 'socket.io-client';
import { API_URL } from './client';

let socket: Socket | null = null;

/** Oturum token'ıyla gerçek zamanlı bağlantı kurar (tekil). */
export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
