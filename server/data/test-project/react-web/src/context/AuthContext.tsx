/**
 * Auth Context
 * Provides authentication state across the app
 */

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<LoginResult>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const token = localStorage.getItem('token');
    if (token) {
      api.setToken(token);
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const userData = await api.get<User>('/api/users/me');
      setUser(userData);
    } catch {
      // Token invalid, clear it
      localStorage.removeItem('token');
      api.setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await api.post<{
        user: User;
        token: string;
        refreshToken: string;
      }>('/api/auth/login', { email, password });
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      api.setToken(response.token);
      setUser(response.user);
      
      return { success: true, user: response.user };
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/api/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      api.setToken(null);
      setUser(null);
    }
  };

  const register = async (
    email: string,
    password: string,
    name?: string
  ): Promise<LoginResult> => {
    try {
      const response = await api.post<{
        user: User;
        token: string;
        refreshToken: string;
      }>('/api/auth/register', { email, password, name });
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      api.setToken(response.token);
      setUser(response.user);
      
      return { success: true, user: response.user };
    } catch (error: any) {
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;

