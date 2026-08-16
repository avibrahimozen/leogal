import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import type { User } from '../types';

const STORAGE_KEY = 'ulak.session';

interface AuthState {
  loading: boolean;
  token: string | null;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Açılışta kayıtlı oturumu geri yükle
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { token: string; user: User };
          setAuthToken(saved.token);
          setToken(saved.token);
          setUser(saved.user);
          connectSocket(saved.token);
          // Arka planda güncel profili çek (onay durumu değişmiş olabilir)
          api
            .get<{ user: User }>('/auth/me')
            .then((res) => {
              setUser(res.user);
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: saved.token, user: res.user })).catch(() => {});
            })
            .catch(() => {});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: User) => {
    setAuthToken(newToken);
    setToken(newToken);
    setUser(newUser);
    connectSocket(newToken);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: newUser }));
  }, []);

  const signOut = useCallback(async () => {
    disconnectSocket();
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await api.get<{ user: User }>('/auth/me');
    setUser(res.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: res.user }));
  }, [token]);

  const value = useMemo(
    () => ({ loading, token, user, signIn, signOut, refreshUser }),
    [loading, token, user, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
