
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  SafeAreaView,
  FlatList,
  Modal,
  TextInput,
  Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../hooks';
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';
import AnimatedFrameOverlay from '../components/AnimatedFrameOverlay';


interface MerchantStatus {
  revenue: number;
  requirement: number;
  percentage: number;
  status: string;
  atRisk: boolean;
  resetDate: string;
}

interface UserProfile {
  id: string;
  username: string;
  bio: string;
  followers: number;
  following: number;
  avatar?: string | null;
  avatarFrame?: string;
  frameAnimationUrl?: string | null;
  profileBackground?: string;
  level: number;
  role?: string;
  merchantStatus?: MerchantStatus | null;
  achievements: Achievement[];
  isOnline: boolean;
  country?: string;
  gender?: string;
  albumPhotos?: AlbumPhoto[];
  gifts?: Gift[];
  isFollowing?: boolean; // Added to UserProfile interface
  isBusy?: boolean; // Added to UserProfile interface
  busyMessage?: string; // Added to UserProfile interface
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  color: string;
  count?: number;
}

interface AlbumPhoto {
  id: string;
  url: string;
  filename: string;
  uploadedAt: string;
}

interface Gift {
  id: string;
  name: string;
  icon: string;
  count: number;
  color: string;
}

interface FamilyBadge {
  familyId: string;
  familyName: string;
  familyLevel: number;
  familyRole: string;
  joinedAt: string;
}

// Helper function to get family level color
const getFamilyLevelColor = (level: number, isDarkMode: boolean): string => {
  if (isDarkMode) {
    switch (level) {
      case 1: return '#03DAC6'; // Teal (success)
      case 2: return '#64B5F6'; // Light Blue (info)
      case 3: return '#BB86FC'; // Purple (primary)
      case 4: return '#CF6679'; // Pink Red (error)
      case 5: return '#E0E0E0'; // Light Gray (Extreme)
      default: return '#03DAC6'; // Default to teal
    }
  } else {
    switch (level) {
      case 1: return '#4CAF50'; // Green
      case 2: return '#2196F3'; // Blue
      case 3: return '#9C27B0'; // Purple
      case 4: return '#F44336'; // Red
      case 5: return '#212121'; // Black (Extreme)
      default: return '#4CAF50'; // Default to green
    }
  }
};

// Helper function to get user level badge color
const getUserLevelBadgeColor = (level: number, isDarkMode: boolean): string => {
  if (isDarkMode) {
    if (level >= 1 && level <= 10) return '#03DAC6'; // Teal
    if (level >= 10 && level <= 25) return '#64B5F6'; // Light Blue
    if (level >= 25 && level <= 50) return '#FFB74D'; // Orange
    if (level >= 50 && level <= 75) return '#FDD835'; // Yellow
    if (level >= 75 && level <= 100) return '#CF6679'; // Pink Red
    return '#03DAC6'; // Default teal
  } else {
    if (level >= 1 && level <= 10) return '#4CAF50'; // Green
    if (level >= 10 && level <= 25) return '#2196F3'; // Blue
    if (level >= 25 && level <= 50) return '#FF6F00'; // Dark Orange
    if (level >= 50 && level <= 75) return '#F57F17'; // Dark Yellow
    if (level >= 75 && level <= 100) return '#C62828'; // Dark Red
    return '#4CAF50'; // Default green
  }
};

const createThemedStyles = (colors: any, isDarkMode: boolean) => ({
  container: {
    ...styles.container,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...styles.loadingText,
    color: colors.badgeTextLight,
  },
  errorText: {
    ...styles.errorText,
    color: colors.text,
  },
  backgroundImageContainer: {
    ...styles.backgroundImageContainer,
    backgroundColor: colors.card,
  },
  headerButtonGradient: {
    ...styles.headerButtonGradient,
    shadowColor: colors.shadow,
  },
  profileContent: {
    ...styles.profileContent,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
  },
  simpleAvatarContainer: {
    ...styles.simpleAvatarContainer,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
  },
  livingStatus: {
    ...styles.livingStatus,
    shadowColor: colors.shadow,
  },
  livingText: {
    ...styles.livingText,
    color: colors.badgeTextLight,
  },
  livingDot: {
    ...styles.livingDot,
    backgroundColor: colors.badgeTextLight,
  },
  simpleDefaultAvatar: {
    ...styles.simpleDefaultAvatar,
    backgroundColor: colors.avatarBg,
  },
  defaultAvatar: {
    ...styles.defaultAvatar,
    backgroundColor: colors.avatarBg,
  },
  avatarText: {
    ...styles.avatarText,
    color: colors.badgeTextLight,
  },
  username: {
    ...styles.username,
    color: colors.text,
  },
  levelBadgeText: {
    ...styles.levelBadgeText,
    color: colors.badgeTextLight,
  },
  userRole: {
    ...styles.userRole,
    color: colors.error,
  },
  followStatText: {
    ...styles.followStatText,
    color: colors.text,
  },
  followStatNumber: {
    ...styles.followStatNumber,
    color: colors.primary,
  },
  bio: {
    ...styles.bio,
    color: colors.textSecondary,
  },
  familyBadgeContainer: {
    ...styles.familyBadgeContainer,
    shadowColor: colors.shadow,
  },
  familyIconCircle: {
    ...styles.familyIconCircle,
    backgroundColor: colors.badgeTextLight,
    shadowColor: colors.shadow,
  },
  familyBadgeName: {
    ...styles.familyBadgeName,
    color: colors.badgeTextLight,
  },
  merchantBadgeContainer: {
    ...styles.merchantBadgeContainer,
    shadowColor: colors.shadow,
  },
  merchantBadgeAtRisk: {
    ...styles.merchantBadgeAtRisk,
    shadowColor: colors.textSecondary,
  },
  merchantBadgeText: {
    ...styles.merchantBadgeText,
    color: colors.badgeTextLight,
  },
  merchantRevenueText: {
    ...styles.merchantRevenueText,
    color: colors.badgeTextLight,
  },
  merchantWarningText: {
    ...styles.merchantWarningText,
    color: colors.error,
  },
  followButtonContainer: {
    ...styles.followButtonContainer,
    shadowColor: colors.primary,
  },
  followButtonText: {
    ...styles.followButtonText,
    color: colors.badgeTextLight,
  },
  messageButton: {
    ...styles.messageButton,
    shadowColor: colors.error,
  },
  messageButtonText: {
    ...styles.messageButtonText,
    color: colors.badgeTextLight,
  },
  sectionTitle: {
    ...styles.sectionTitle,
    color: colors.text,
  },
  albumPhotoItem: {
    ...styles.albumPhotoItem,
    shadowColor: colors.shadow,
  },
  giftItem: {
    ...styles.giftItem,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
  },
  giftCount: {
    ...styles.giftCount,
    color: colors.text,
  },
  achievementItem: {
    ...styles.achievementItem,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
  },
  achievementName: {
    ...styles.achievementName,
    color: colors.text,
  },
  achievementCount: {
    ...styles.achievementCount,
    color: colors.error,
  },
  saveButtonContainer: {
    ...styles.saveButtonContainer,
    shadowColor: colors.primary,
  },
  saveButtonText: {
    ...styles.saveButtonText,
    color: colors.badgeTextLight,
  },
  cancelButton: {
    ...styles.cancelButton,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  },
  cancelButtonText: {
    ...styles.cancelButtonText,
    color: colors.textSecondary,
  },
  busyStatusSection: {
    ...styles.busyStatusSection,
    shadowColor: colors.shadow,
  },
  busyStatusTitle: {
    ...styles.busyStatusTitle,
    color: colors.text,
  },
  toggleSwitch: {
    ...styles.toggleSwitch,
    backgroundColor: isDarkMode ? '#424242' : '#E0E0E0',
  },
  toggleSwitchActive: {
    ...styles.toggleSwitchActive,
    backgroundColor: colors.success,
  },
  busyToggle: {
    ...styles.busyToggle,
  },
  toggleThumb: {
    ...styles.toggleThumb,
    backgroundColor: colors.switchThumb,
    shadowColor: colors.shadow,
  },
  toggleThumbActive: {
    ...styles.toggleThumbActive,
  },
  busyToggleText: {
    ...styles.busyToggleText,
    color: colors.text,
  },
  busyMessageButton: {
    ...styles.busyMessageButton,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)',
  },
  busyMessageText: {
    ...styles.busyMessageText,
    color: colors.textSecondary,
  },
  modalOverlay: {
    ...styles.modalOverlay,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
  },
  busyModalContainer: {
    ...styles.busyModalContainer,
    shadowColor: colors.shadow,
  },
  busyModalHeader: {
    ...styles.busyModalHeader,
    borderBottomColor: colors.border,
  },
  busyModalTitle: {
    ...styles.busyModalTitle,
    color: colors.text,
  },
  busyModalLabel: {
    ...styles.busyModalLabel,
    color: colors.textSecondary,
  },
  busyMessageInput: {
    ...styles.busyMessageInput,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  busyModalCancelButton: {
    ...styles.busyModalCancelButton,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  },
  busyModalCancelText: {
    ...styles.busyModalCancelText,
    color: colors.textSecondary,
  },
  busyModalSaveText: {
    ...styles.busyModalSaveText,
    color: colors.badgeTextLight,
  },
  backgroundMenuContainer: {
    ...styles.backgroundMenuContainer,
    shadowColor: colors.shadow,
  },
  backgroundMenuTitle: {
    ...styles.backgroundMenuTitle,
    color: colors.text,
  },
  backgroundMenuButtonText: {
    ...styles.backgroundMenuButtonText,
    color: colors.badgeTextLight,
  },
  backgroundMenuCancel: {
    ...styles.backgroundMenuCancel,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  },
  backgroundMenuCancelText: {
    ...styles.backgroundMenuCancelText,
    color: colors.textSecondary,
  },
  editBackgroundButton: {
    ...styles.editBackgroundButton,
    shadowColor: colors.shadow,
  },
});

export default function ProfileScreen({ navigation, route }: any) {
  const { user, token } = useAuth();
  const { colors, isDarkMode } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [familyBadge, setFamilyBadge] = useState<FamilyBadge | null>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // State for busy status
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('This user is busy');
  const [showBusyModal, setShowBusyModal] = useState(false);

  // State for reporting
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // State for background editing
  const [selectedPhotoForBackground, setSelectedPhotoForBackground] = useState<AlbumPhoto | null>(null);
  const [showBackgroundMenu, setShowBackgroundMenu] = useState(false);

  // Placeholder for form data and counts if editing is implemented
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    bio: '',
    location: '',
    interests: '',
  });
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Get user ID from route params or use current user
  const userId = route?.params?.userId || user?.id;
  const isOwnProfile = userId === user?.id;

  // Themed styles
  const themedStyles = useMemo(() => createThemedStyles(colors, isDarkMode), [colors, isDarkMode]);

  useEffect(() => {
    fetchUserProfile();
    fetchAlbumPhotos();
    fetchFamilyBadge();
    startAnimations();
  }, [userId]);

  const startAnimations = () => {
    // Start entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Header animation
    setTimeout(() => {
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }, 300);

    // Pulse animation for living status
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const fetchUserProfile = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/users/${userId}/profile`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
          'Authorization': token ? `Bearer ${token}` : '', // Include token for follow status check
        },
      });

      if (response.ok) {
        const profileData = await response.json();
        
        // Process avatar URL - handle both full URLs and relative paths
        if (profileData.avatar) {
          if (profileData.avatar.startsWith('/api/')) {
            profileData.avatar = `${BASE_URL}${profileData.avatar}`;
          } else if (!profileData.avatar.startsWith('http')) {
            // Handle case where avatar might be stored as relative path
            profileData.avatar = `${BASE_URL}${profileData.avatar}`;
          }
        }

        // Process profile background - convert from snake_case to camelCase
        if (profileData.profile_background) {
          profileData.profileBackground = profileData.profile_background;
          console.log('Profile background loaded:', profileData.profileBackground);
        }

        // Check if current user is following this profile (only if not own profile and user is authenticated)
        if (!isOwnProfile && token && user?.id) {
          try {
            const followCheckResponse = await fetch(`${API_BASE_URL}/users/${userId}/follow-status`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'ChatMe-Mobile-App',
              },
            });
            if (followCheckResponse.ok) {
              const followStatus = await followCheckResponse.json();
              profileData.isFollowing = followStatus.isFollowing || false;
            }
          } catch (error) {
            console.error('Error checking follow status:', error);
            profileData.isFollowing = false;
          }
        }

        // Fetch gifts from API
        try {
          const giftsResponse = await fetch(`${API_BASE_URL}/users/${userId}/gifts`, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ChatMe-Mobile-App',
            },
          });
          if (giftsResponse.ok) {
            profileData.gifts = await giftsResponse.json();
          } else {
            profileData.gifts = [];
          }
        } catch (error) {
          console.error('Error fetching gifts:', error);
          profileData.gifts = [];
        }

        // Fetch achievements from API
        try {
          const achievementsResponse = await fetch(`${API_BASE_URL}/users/${userId}/achievements`, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ChatMe-Mobile-App',
            },
          });
          if (achievementsResponse.ok) {
            profileData.achievements = await achievementsResponse.json();
          } else {
            profileData.achievements = [];
          }
        } catch (error) {
          console.error('Error fetching achievements:', error);
          profileData.achievements = [];
        }

        // Load current busy status if it's the user's own profile
        if (isOwnProfile && user?.username) {
          try {
            const busyResponse = await fetch(`${API_BASE_URL}/user/busy-status`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            if (busyResponse.ok) {
              const busyData = await busyResponse.json();
              setIsBusy(busyData.is_busy);
              setBusyMessage(busyData.busy_message || 'This user is busy');
            }
          } catch (busyError) {
            console.log('Could not load busy status:', busyError);
          }
        }

        setProfile(profileData);
        setIsFollowing(profileData.isFollowing || false);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userId, token, isOwnProfile, user]);

  const fetchAlbumPhotos = React.useCallback(async () => {
    try {
      console.log('Fetching album photos for user:', userId);
      const response = await fetch(`${API_BASE_URL}/users/${userId}/album`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const photos = data.photos || [];
        console.log('Album photos fetched:', photos.length, 'photos');
        console.log('Album photos data:', JSON.stringify(photos));
        setAlbumPhotos(photos);
        console.log('albumPhotos state updated');
      } else {
        console.log('Album photos response not ok:', response.status);
        setAlbumPhotos([]);
      }
    } catch (error) {
      console.error('Error fetching album:', error);
      setAlbumPhotos([]);
    }
  }, [userId, token]);

  // Refresh profile when screen is focused (e.g., after returning from EditProfileScreen)
  useFocusEffect(
    React.useCallback(() => {
      fetchUserProfile();
      fetchAlbumPhotos();
    }, [fetchUserProfile, fetchAlbumPhotos])
  );

  const fetchFamilyBadge = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/family-badge`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const badge = await response.json();
        setFamilyBadge(badge);
      } else {
        setFamilyBadge(null);
      }
    } catch (error) {
      console.error('Error fetching family badge:', error);
      setFamilyBadge(null);
    }
  };

  const handleFollow = async () => {
    if (!profile || isOwnProfile || !token) return;

    try {
      console.log('Follow request:', {
        userId,
        action: isFollowing ? 'unfollow' : 'follow',
        token: token ? 'Present' : 'Missing'
      });

      const response = await fetch(`${API_BASE_URL}/users/${userId}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          action: isFollowing ? 'unfollow' : 'follow'
        }),
      });

      console.log('Follow response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        setIsFollowing(!isFollowing);

        // Update profile with the exact counts from server response
        setProfile(prev => prev ? {
          ...prev,
          followers: result.followers || (isFollowing ? prev.followers - 1 : prev.followers + 1),
          following: result.following || prev.following
        } : null);

        console.log('Follow action completed:', result);
      } else {
        const errorData = await response.json();
        console.error('Follow request failed:', errorData);
        throw new Error(errorData.error || 'Failed to update follow status');
      }
    } catch (error) {
      console.error('Error following user:', error);
      Alert.alert('Error', (error as any).message || 'Failed to update follow status');
    }
  };

  const handleMessage = async () => {
    if (profile && user) {
      try {
        console.log('Creating private chat between:', user.username, 'and', profile.username);

        // Create private chat via API
        const response = await fetch(`${API_BASE_URL}/chat/private`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'ChatMe-Mobile-App',
          },
          body: JSON.stringify({
            participants: [user.username, profile.username],
            initiatedBy: user.username
          }),
        });

        console.log('Private chat response status:', response.status);

        if (response.ok) {
          const privateChat = await response.json();
          console.log(privateChat.isExisting ? 'Existing private chat found:' : 'Private chat created successfully:', privateChat.id);

          // Ensure targetUser has proper structure
          const targetUser = {
            id: profile.id || Date.now().toString(),
            username: profile.username,
            role: profile.role || 'user',
            level: profile.level || 1,
            avatar: profile.avatar || null
          };

          // Navigate to private chat
          navigation.navigate('PrivateChat', {
            roomId: privateChat.id,
            roomName: `Chat with ${profile.username}`,
            roomDescription: `Private chat with ${profile.username}`,
            type: 'private',
            targetUser: targetUser,
            autoFocusTab: true
          });
        } else if (response.status === 423) {
          // User is busy
          const errorData = await response.json();
          Alert.alert(
            'User is Busy',
            errorData.error || 'This user cannot be chatted, is busy',
            [{ text: 'OK' }]
          );
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Private chat creation failed:', errorData);
          Alert.alert('Error', errorData.error || 'Failed to create private chat');
        }
      } catch (error) {
        console.error('Error creating private chat:', error);
        Alert.alert('Error', 'Failed to create private chat');
      }
    }
  };

  // Busy status functions
  const handleBusyToggle = async () => {
    if (!token || !user?.username) return;
    try {
      const response = await fetch(`${API_BASE_URL}/user/busy-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_busy: !isBusy,
          busy_message: busyMessage
        }),
      });

      if (response.ok) {
        setIsBusy(!isBusy);
        Alert.alert(
          'Status Updated',
          !isBusy ? 'You are now marked as busy' : 'You are no longer busy',
          [{ text: 'OK' }]
        );
      } else {
        throw new Error('Failed to update busy status');
      }
    } catch (error) {
      console.error('Error updating busy status:', error);
      Alert.alert('Error', 'Failed to update busy status');
    }
  };

  const handleBusyMessageUpdate = async () => {
    if (!token || !user?.username) return;
    try {
      const response = await fetch(`${API_BASE_URL}/user/busy-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_busy: isBusy,
          busy_message: busyMessage
        }),
      });

      if (response.ok) {
        setShowBusyModal(false);
        Alert.alert('Success', 'Busy message updated');
      } else {
        throw new Error('Failed to update busy message');
      }
    } catch (error) {
      console.error('Error updating busy message:', error);
      Alert.alert('Error', 'Failed to update busy message');
    }
  };

  // Handle saving photo as background
  const handleSaveAsBackground = async (photo: AlbumPhoto) => {
    if (!token || !user?.id) return;
    
    try {
      const backgroundUrl = photo.url;
      
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/profile-background`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ backgroundUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update local profile state
        setProfile(prev => prev ? { ...prev, profileBackground: data.profileBackground } : null);
        Alert.alert('Success', 'Background updated successfully');
      } else {
        throw new Error('Failed to update background');
      }
    } catch (error) {
      console.error('Error updating background:', error);
      Alert.alert('Error', 'Failed to update background');
    } finally {
      setShowBackgroundMenu(false);
      setSelectedPhotoForBackground(null);
    }
  };

  const renderAlbumPhoto = ({ item }: { item: AlbumPhoto }) => (
    <View style={themedStyles.albumPhotoItem}>
      <TouchableOpacity
        onPress={() => {
          if (isOwnProfile) {
            setSelectedPhotoForBackground(item);
            setShowBackgroundMenu(true);
          }
        }}
        activeOpacity={isOwnProfile ? 0.7 : 1}
      >
        <Image 
          source={{ uri: `${BASE_URL}${item.url}` }} 
          style={styles.albumPhotoImage}
          onError={(error) => {
            console.log('Album photo loading failed:', item.url, error.nativeEvent.error);
          }}
        />
      </TouchableOpacity>
    </View>
  );

  const renderGift = ({ item }: { item: Gift }) => (
    <Animated.View style={[themedStyles.giftItem, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.giftIcon}>{item.icon}</Text>
      <Text style={themedStyles.giftCount}>{item.count}</Text>
    </Animated.View>
  );

  const renderAchievement = ({ item }: { item: Achievement }) => (
    <Animated.View style={[themedStyles.achievementItem, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.achievementIcon}>{item.icon}</Text>
      <Text style={themedStyles.achievementName}>{item.name}</Text>
      {item.count && <Text style={themedStyles.achievementCount}>{item.count}</Text>}
    </Animated.View>
  );

  if (loading) {
    return (
      <SafeAreaView style={themedStyles.container}>
        <LinearGradient
          colors={isDarkMode ? [colors.primary, colors.info] : ['#667eea', '#764ba2']}
          style={styles.loadingContainer}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={themedStyles.loadingText}>Loading...</Text>
          </Animated.View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={themedStyles.container}>
        <View style={styles.errorContainer}>
          <Text style={themedStyles.errorText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={themedStyles.container}>
      {/* Animated Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <LinearGradient
            colors={isDarkMode ? ['rgba(66,66,66,0.8)', 'rgba(66,66,66,0.6)'] : ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.6)']}
            style={themedStyles.headerButtonGradient}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={16}
        bounces={true}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Background Image Area with Gradient Overlay */}
        <View style={themedStyles.backgroundImageContainer}>
          <Image 
            source={
              profile.profileBackground
                ? { 
                    uri: profile.profileBackground.startsWith('http') 
                      ? profile.profileBackground 
                      : `${BASE_URL}${profile.profileBackground}` 
                  }
                : albumPhotos.length > 0 && albumPhotos[0]?.url
                ? { uri: `${BASE_URL}${albumPhotos[0].url}` }
                : require('../../assets/Bg_profile/Bg_profile.jpeg')
            } 
            style={styles.backgroundImage}
            resizeMode="cover"
            onError={(error) => {
              console.log('Background image loading failed:', error.nativeEvent.error);
            }}
            onLoad={() => {
              console.log('Background image loaded successfully');
            }}
          />
          <LinearGradient
            colors={isDarkMode ? ['transparent', 'rgba(18,18,18,0.4)', 'rgba(18,18,18,0.7)'] : ['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']}
            style={styles.backgroundOverlay}
          />

          {/* Edit Background Icon - Only show for own profile */}
          {isOwnProfile && (
            <TouchableOpacity 
              style={themedStyles.editBackgroundButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <LinearGradient
                colors={isDarkMode ? ['rgba(66,66,66,0.9)', 'rgba(66,66,66,0.7)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
                style={styles.editBackgroundGradient}
              >
                <Ionicons name="pencil" size={20} color={colors.text} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile Content with slide animation */}
        <Animated.View 
          style={[
            themedStyles.profileContent,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          {/* Avatar with frame */}
          <Animated.View 
            style={[
              styles.avatarContainer,
              { transform: [{ scale: scaleAnim }] }
            ]}
          >
            <View style={themedStyles.simpleAvatarContainer}>
              {/* Avatar Frame (static or animated) */}
              {(profile.avatarFrame || profile.frameAnimationUrl) && (
                <AnimatedFrameOverlay
                  frameImage={profile.avatarFrame ? (profile.avatarFrame.startsWith('http') ? profile.avatarFrame : `${BASE_URL}${profile.avatarFrame}`) : null}
                  animationUrl={profile.frameAnimationUrl}
                  size={120}
                  style={{ top: -16, left: -16 }}
                />
              )}
              
              {/* Avatar Image */}
              {profile.avatar ? (
                <Image 
                  source={{ uri: profile.avatar }} 
                  style={styles.simpleAvatar}
                  onError={(error) => {
                    console.log('Avatar loading failed:', error.nativeEvent.error);
                    setProfile(prev => prev ? { ...prev, avatar: null } : null);
                  }}
                />
              ) : (
                <LinearGradient
                  colors={isDarkMode ? [colors.primary, colors.info] : ['#667eea', '#764ba2']}
                  style={themedStyles.simpleDefaultAvatar}
                >
                  <Text style={themedStyles.avatarText}>
                    {profile.username.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </View>
          </Animated.View>

          {/* User Info */}
          <View style={styles.userInfo}>
            <View style={styles.nameContainer}>
              <View style={styles.usernameRow}>
                <Text style={themedStyles.username}>{profile.username}</Text>
                <LinearGradient
                  colors={isDarkMode ? [colors.primary, colors.error] : ['#9333ea', '#dc2626']}
                  style={[styles.levelBadgeCapsule, { backgroundColor: getUserLevelBadgeColor(profile.level || 1, isDarkMode) }]}
                >
                  <Text style={themedStyles.levelBadgeText}>Lv {profile.level || 1}</Text>
                </LinearGradient>
                
                {/* Role Badge - Merchant, Admin, Mentor */}
                {profile.role && (profile.role === 'merchant' || profile.role === 'admin' || profile.role === 'mentor') && (
                  <Image
                    source={
                      profile.role === 'merchant'
                        ? require('../../assets/badges/merchant.png')
                        : profile.role === 'admin'
                        ? require('../../assets/badges/admin.png')
                        : require('../../assets/badges/mentor.png')
                    }
                    style={styles.roleBadgeIcon}
                    resizeMode="contain"
                  />
                )}
                
                {profile.gender && (() => {
                  const genderLower = profile.gender.toLowerCase();
                  const isMale = genderLower === 'male' || genderLower === 'pria' || genderLower === 'laki-laki';
                  const isFemale = genderLower === 'female' || genderLower === 'wanita' || genderLower === 'perempuan';
                  
                  if (isMale) {
                    return (
                      <Image
                        source={require('../../assets/gender/male.png')}
                        style={styles.genderIcon}
                        resizeMode="contain"
                      />
                    );
                  } else if (isFemale) {
                    return (
                      <Image
                        source={require('../../assets/gender/female.png')}
                        style={styles.genderIcon}
                        resizeMode="contain"
                      />
                    );
                  }
                  return null;
                })()}
              </View>
              <Text style={themedStyles.userRole}></Text>
            </View>

            {/* Follow Stats */}
            <View style={styles.followStatsContainer}>
              <TouchableOpacity style={styles.followStatItem}>
                <Text style={themedStyles.followStatText}>
                  Ikuti <Text style={themedStyles.followStatNumber}>[{profile.followers || followersCount || 0}]</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followStatItem}>
                <Text style={themedStyles.followStatText}>
                  Mengikuti <Text style={themedStyles.followStatNumber}>[{profile.following || followingCount || 0}]</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bio */}
            {profile.bio && (
              <Text style={themedStyles.bio}>{profile.bio}</Text>
            )}

            {/* Family Badge with enhanced gradient */}
            {familyBadge && (
              <TouchableOpacity 
                style={themedStyles.familyBadgeContainer}
                onPress={() => navigation.navigate('FamilyDetailScreen', { familyId: familyBadge.familyId })}
              >
                <LinearGradient
                  colors={[getFamilyLevelColor(familyBadge.familyLevel, isDarkMode), isDarkMode ? colors.card : '#2c3e50']}
                  style={styles.familyBadge}
                >
                  <View style={styles.familyBadgeIcon}>
                    <View style={themedStyles.familyIconCircle}>
                      <Ionicons name="diamond" size={14} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={themedStyles.familyBadgeName} numberOfLines={1}>
                    {familyBadge.familyName}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Merchant Badge with "Luntur Warna" Effect */}
            {profile.role === 'merchant' && profile.merchantStatus && (
              <View 
                style={[
                  themedStyles.merchantBadgeContainer,
                  profile.merchantStatus.atRisk && themedStyles.merchantBadgeAtRisk
                ]}
              >
                <LinearGradient
                  colors={profile.merchantStatus.atRisk ? [colors.textSecondary, colors.border] : [colors.warning, colors.error]}
                  style={[
                    styles.merchantBadge,
                    { opacity: profile.merchantStatus.atRisk ? 0.4 : 1.0 }
                  ]}
                >
                  <View style={styles.merchantBadgeIcon}>
                    <Ionicons 
                      name="storefront" 
                      size={16} 
                      color={profile.merchantStatus.atRisk ? colors.textSecondary : colors.warning} 
                    />
                  </View>
                  <View style={styles.merchantBadgeContent}>
                    <Text style={[
                      themedStyles.merchantBadgeText,
                      { color: profile.merchantStatus.atRisk ? colors.textSecondary : colors.badgeTextLight }
                    ]}>
                      Merchant
                    </Text>
                    <View style={styles.merchantProgressBar}>
                      <View 
                        style={[
                          styles.merchantProgress, 
                          { 
                            width: `${Math.min(profile.merchantStatus.percentage, 100)}%`,
                            backgroundColor: profile.merchantStatus.atRisk ? colors.border : colors.warning
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[
                      themedStyles.merchantRevenueText,
                      { color: profile.merchantStatus.atRisk ? colors.textSecondary : colors.badgeTextLight }
                    ]}>
                      {profile.merchantStatus.revenue.toLocaleString()} / {profile.merchantStatus.requirement.toLocaleString()} coins ({profile.merchantStatus.percentage}%)
                    </Text>
                    {profile.merchantStatus.atRisk && (
                      <Text style={themedStyles.merchantWarningText}>⚠️ At Risk - Low Revenue</Text>
                    )}
                  </View>
                </LinearGradient>
              </View>
            )}
          </View>

          {/* Achievements */}
          {profile.achievements && profile.achievements.length > 0 && (
            <View style={styles.achievementsSection}>
              <Text style={themedStyles.sectionTitle}>Pencapaian</Text>
              <FlatList
                data={profile.achievements}
                renderItem={renderAchievement}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.achievementsContainer}
              />
            </View>
          )}

          {/* Enhanced Action Buttons */}
          {!isOwnProfile && (
            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={handleFollow} style={themedStyles.followButtonContainer}>
                <LinearGradient
                  colors={isFollowing ? [colors.textSecondary, colors.border] : [colors.primary, colors.error]}
                  style={styles.followButton}
                >
                  <Ionicons 
                    name={isFollowing ? "checkmark-circle" : "person-add"} 
                    size={16} 
                    color={colors.badgeTextLight} 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={themedStyles.followButtonText}>
                    {isFollowing ? 'Mengikuti' : 'Ikuti'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={themedStyles.messageButton} onPress={handleMessage}>
                <LinearGradient
                  colors={[colors.primary, colors.error]}
                  style={styles.messageButtonGradient}
                >
                  <Ionicons name="chatbubble" size={16} color={colors.badgeTextLight} />
                  <Text style={themedStyles.messageButtonText}>Pesan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Album Photos */}
          {albumPhotos.length > 0 && (
            <View style={styles.albumSection}>
              <Text style={themedStyles.sectionTitle}>Album</Text>
              <FlatList
                data={albumPhotos.slice(0, 6)}
                renderItem={renderAlbumPhoto}
                numColumns={3}
                scrollEnabled={false}
                contentContainerStyle={styles.albumGrid}
              />
            </View>
          )}

          {/* Gifts Received */}
          {profile.gifts && profile.gifts.length > 0 && (
            <View style={styles.giftsSection}>
              <Text style={themedStyles.sectionTitle}>Hadiah yang Diterima</Text>
              <FlatList
                data={profile.gifts}
                renderItem={renderGift}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.giftsContainer}
              />
            </View>
          )}

          {/* Additional Actions for Own Profile */}
          {isOwnProfile && (
            <>
              {/* Busy Status Control */}
              <View style={themedStyles.busyStatusSection}>
                <LinearGradient
                  colors={isDarkMode ? ['rgba(66,66,66,0.9)', 'rgba(66,66,66,0.7)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
                  style={styles.busyStatusGradient}
                >
                  <View style={styles.busyStatusHeader}>
                    <Text style={themedStyles.busyStatusTitle}>Busy Status</Text>
                    <TouchableOpacity
                      style={themedStyles.busyToggle}
                      onPress={handleBusyToggle}
                    >
                      <View style={[themedStyles.toggleSwitch, isBusy && themedStyles.toggleSwitchActive]}>
                        <View style={[themedStyles.toggleThumb, isBusy && themedStyles.toggleThumbActive]} />
                      </View>
                      <Text style={themedStyles.busyToggleText}>
                        {isBusy ? 'Busy' : 'Available'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isBusy && (
                    <TouchableOpacity
                      style={themedStyles.busyMessageButton}
                      onPress={() => setShowBusyModal(true)}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                      <Text style={themedStyles.busyMessageText}>{busyMessage}</Text>
                    </TouchableOpacity>
                  )}
                </LinearGradient>
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={themedStyles.saveButtonContainer}
                  onPress={() => navigation.navigate('EditProfile')} 
                  disabled={loading}
                >
                  <LinearGradient
                    colors={isDarkMode ? [colors.primary, colors.info] : ['#667eea', '#764ba2']}
                    style={styles.saveButton}
                  >
                    <Text style={themedStyles.saveButtonText}>
                      {loading ? 'Saving...' : 'Edit Profile'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={themedStyles.cancelButton}
                  onPress={() => navigation.goBack()} 
                >
                  <Text style={themedStyles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {/* Busy Message Modal */}
      <Modal
        visible={showBusyModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBusyModal(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <LinearGradient
            colors={isDarkMode ? ['rgba(42,42,42,0.95)', 'rgba(42,42,42,0.9)'] : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']}
            style={themedStyles.busyModalContainer}
          >
            <View style={themedStyles.busyModalHeader}>
              <Text style={themedStyles.busyModalTitle}>Edit Busy Message</Text>
              <TouchableOpacity onPress={() => setShowBusyModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.busyModalContent}>
              <Text style={themedStyles.busyModalLabel}>Message to show when others try to chat:</Text>
              <TextInput
                style={themedStyles.busyMessageInput}
                value={busyMessage}
                onChangeText={setBusyMessage}
                placeholder="Enter busy message"
                multiline={true}
                maxLength={255}
              />

              <View style={styles.busyModalActions}>
                <TouchableOpacity
                  style={themedStyles.busyModalCancelButton}
                  onPress={() => setShowBusyModal(false)}
                >
                  <Text style={themedStyles.busyModalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBusyMessageUpdate}
                >
                  <LinearGradient
                    colors={isDarkMode ? [colors.info, colors.primary] : ['#007AFF', '#0051D0']}
                    style={styles.busyModalSaveButton}
                  >
                    <Text style={themedStyles.busyModalSaveText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* Background Menu Modal */}
      <Modal
        visible={showBackgroundMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowBackgroundMenu(false);
          setSelectedPhotoForBackground(null);
        }}
      >
        <View style={themedStyles.modalOverlay}>
          <LinearGradient
            colors={isDarkMode ? ['rgba(42,42,42,0.95)', 'rgba(42,42,42,0.9)'] : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']}
            style={themedStyles.backgroundMenuContainer}
          >
            <View style={styles.backgroundMenuContent}>
              <Text style={themedStyles.backgroundMenuTitle}>Set as Background</Text>
              
              {selectedPhotoForBackground && (
                <>
                  <TouchableOpacity
                    style={styles.backgroundMenuButton}
                    onPress={() => handleSaveAsBackground(selectedPhotoForBackground)}
                  >
                    <LinearGradient
                      colors={isDarkMode ? [colors.primary, colors.info] : ['#667eea', '#764ba2']}
                      style={styles.backgroundMenuButtonGradient}
                    >
                      <Text style={themedStyles.backgroundMenuButtonText}>Save to Background</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={themedStyles.backgroundMenuCancel}
                    onPress={() => {
                      setShowBackgroundMenu(false);
                      setSelectedPhotoForBackground(null);
                    }}
                  >
                    <Text style={themedStyles.backgroundMenuCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  menuButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  headerButtonGradient: {
    padding: 12,
    borderRadius: 25,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
  },
  backgroundImageContainer: {
    height: 300,
    position: 'relative',
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  livingStatus: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  livingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  livingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  livingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    paddingTop: 25,
    paddingHorizontal: 20,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: -60,
    marginBottom: 25,
  },
  simpleAvatarContainer: {
    position: 'relative',
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'visible',
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarFrameImage: {
    position: 'absolute',
    top: -16,
    left: -16,
    width: 120,
    height: 120,
    zIndex: 2,
  },
  simpleAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    resizeMode: 'cover',
  },
  simpleDefaultAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    resizeMode: 'cover',
  },
  defaultAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 25,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 20,
    fontWeight: 'normal',
  },
  levelBadgeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 6,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  genderIcon: {
    width: 24,
    height: 24,
  },
  roleBadgeIcon: {
    width: 32,
    height: 32,
  },
  userRole: {
    fontSize: 18,
    fontWeight: '600',
  },
  followStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
    gap: 30,
  },
  followStatItem: {
    alignItems: 'center',
  },
  followStatText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  followStatNumber: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bio: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  familyBadgeContainer: {
    marginTop: 12,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 120,
    maxWidth: 180,
  },
  familyBadgeIcon: {
    marginRight: 8,
  },
  familyIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  familyBadgeName: {
    fontSize: 14,
    fontWeight: 'bold',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flex: 1,
  },
  merchantBadgeContainer: {
    marginTop: 16,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    minWidth: 250,
    maxWidth: 320,
  },
  merchantBadgeAtRisk: {
    shadowOpacity: 0.15,
  },
  merchantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  merchantBadgeIcon: {
    marginRight: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  merchantBadgeContent: {
    flex: 1,
  },
  merchantBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  merchantProgressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  merchantProgress: {
    height: '100%',
    borderRadius: 3,
  },
  merchantRevenueText: {
    fontSize: 10,
    fontWeight: '600',
  },
  merchantWarningText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
    gap: 10,
    paddingHorizontal: 20,
  },
  followButtonContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageButton: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  messageButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 6,
  },
  messageButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  albumSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  albumGrid: {
    gap: 12,
  },
  albumPhotoItem: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  albumPhotoImage: {
    width: '100%',
    height: 120,
    resizeMode: 'cover',
  },
  giftsSection: {
    marginBottom: 30,
  },
  giftsContainer: {
    paddingRight: 20,
  },
  giftItem: {
    borderRadius: 16,
    padding: 16,
    marginRight: 15,
    alignItems: 'center',
    minWidth: 70,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  giftIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  giftCount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  achievementsSection: {
    marginBottom: 30,
  },
  achievementsContainer: {
    paddingRight: 20,
  },
  achievementItem: {
    borderRadius: 16,
    padding: 16,
    marginRight: 15,
    alignItems: 'center',
    minWidth: 90,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  achievementIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  achievementName: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  achievementCount: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 25,
    marginBottom: 25,
  },
  saveButtonContainer: {
    borderRadius: 15,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  saveButton: {
    paddingVertical: 15,
    paddingHorizontal: 35,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    paddingHorizontal: 35,
    borderRadius: 15,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Busy status styles
  busyStatusSection: {
    marginBottom: 25,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  busyStatusGradient: {
    padding: 20,
  },
  busyStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  busyStatusTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  busyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleSwitch: {
    width: 60,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    padding: 3,
  },
  toggleSwitchActive: {
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignSelf: 'flex-start',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  busyToggleText: {
    fontSize: 16,
    fontWeight: '500',
  },
  busyMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  busyMessageText: {
    flex: 1,
    fontSize: 14,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  busyModalContainer: {
    borderRadius: 20,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  busyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 25,
    borderBottomWidth: 1,
  },
  busyModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  busyModalContent: {
    padding: 25,
  },
  busyModalLabel: {
    fontSize: 16,
    marginBottom: 15,
  },
  busyMessageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  busyModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 15,
    marginTop: 25,
  },
  busyModalCancelButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 12,
  },
  busyModalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  busyModalSaveButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 12,
  },
  busyModalSaveText: {
    fontSize: 16,
    fontWeight: '500',
  },
  // Background editing styles
  editBackgroundButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  editBackgroundGradient: {
    padding: 10,
    borderRadius: 20,
  },
  backgroundMenuContainer: {
    borderRadius: 20,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  backgroundMenuContent: {
    padding: 25,
  },
  backgroundMenuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  backgroundMenuButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
  },
  backgroundMenuButtonGradient: {
    padding: 18,
    alignItems: 'center',
  },
  backgroundMenuButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  backgroundMenuCancel: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  backgroundMenuCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
