
export interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
  role?: 'user' | 'merchant' | 'mentor' | 'admin';
  level?: number;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
