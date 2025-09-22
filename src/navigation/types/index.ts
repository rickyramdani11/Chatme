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

// Navigation parameter types
export type RootStackParamList = {
  Main: undefined;
  Auth: undefined;
  EditProfile: undefined;
  Profile: { userId?: string };
  PrivacySecurity: undefined;
  ChangePassword: undefined;
  ChangePin: undefined;
  HelpSupport: undefined;
  Credit: undefined;
  TransactionHistory: undefined;
  TopRank: undefined;
  Notifications: undefined;
  Mentor: undefined;
  AdminScreen: undefined;
  Withdraw: undefined;
  WithdrawHistory: undefined;
  StoreScreen: undefined;
  Chat: {
    roomId: string;
    roomName: string;
    roomDescription?: string;
    type: 'room' | 'private' | 'support';
    targetUser?: {
      id: string;
      username: string;
      role?: string;
      level?: number;
      avatar?: string;
    };
    autoFocusTab?: boolean;
    isSupport?: boolean;
  };
  Room: {
    roomId?: string;
    roomName?: string;
  };
  FamilyScreen: undefined;
  CreateFamilyScreen: undefined;
  FamilyDetailScreen: { familyId: string };
};

export type TabParamList = {
  Home: undefined;
  Feed: undefined;
  Room: undefined;
  Chat: undefined;
  Settings: undefined;
};

// Declare the navigation types globally for React Navigation
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}