
import React, { useState, useEffect, useRef } from 'react';
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
import { useAuth } from '../hooks';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';


interface UserProfile {
  id: string;
  username: string;
  bio: string;
  followers: number;
  following: number;
  avatar?: string | null;
  avatarFrame?: string;
  profileBackground?: string;
  level: number;
  role?: string;
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
const getFamilyLevelColor = (level: number): string => {
  switch (level) {
    case 1: return '#4CAF50'; // Green
    case 2: return '#2196F3'; // Blue
    case 3: return '#9C27B0'; // Purple
    case 4: return '#F44336'; // Red
    case 5: return '#212121'; // Black (Extreme)
    default: return '#4CAF50'; // Default to green
  }
};

// Helper function to get user level badge color
const getUserLevelBadgeColor = (level: number): string => {
  if (level >= 1 && level <= 10) return '#4CAF50'; // Green
  if (level >= 10 && level <= 25) return '#2196F3'; // Blue
  if (level >= 25 && level <= 50) return '#FF6F00'; // Dark Orange
  if (level >= 50 && level <= 75) return '#F57F17'; // Dark Yellow
  if (level >= 75 && level <= 100) return '#C62828'; // Dark Red
  return '#4CAF50'; // Default green
};

export default function ProfileScreen({ navigation, route }: any) {
  const { user, token } = useAuth();
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

  const fetchUserProfile = async () => {
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
  };

  const fetchAlbumPhotos = async () => {
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
        const photos = await response.json();
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
  };

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
    <View style={styles.albumPhotoItem}>
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
    <Animated.View style={[styles.giftItem, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.giftIcon}>{item.icon}</Text>
      <Text style={styles.giftCount}>{item.count}</Text>
    </Animated.View>
  );

  const renderAchievement = ({ item }: { item: Achievement }) => (
    <Animated.View style={[styles.achievementItem, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.achievementIcon}>{item.icon}</Text>
      <Text style={styles.achievementName}>{item.name}</Text>
      {item.count && <Text style={styles.achievementCount}>{item.count}</Text>}
    </Animated.View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.loadingContainer}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={styles.loadingText}>Loading...</Text>
          </Animated.View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <LinearGradient
            colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.6)']}
            style={styles.headerButtonGradient}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
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
        <View style={styles.backgroundImageContainer}>
          <Image 
            source={
              profile.profileBackground
                ? { uri: `${BASE_URL}${profile.profileBackground}` }
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
            colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']}
            style={styles.backgroundOverlay}
          />

          {/* Edit Background Icon - Only show for own profile */}
          {isOwnProfile && (
            <TouchableOpacity 
              style={styles.editBackgroundButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
                style={styles.editBackgroundGradient}
              >
                <Ionicons name="pencil" size={20} color="#333" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile Content with slide animation */}
        <Animated.View 
          style={[
            styles.profileContent,
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
            <View style={styles.simpleAvatarContainer}>
              {/* Avatar Frame (if exists) */}
              {profile.avatarFrame && (
                <Image
                  source={{ uri: profile.avatarFrame.startsWith('http') ? profile.avatarFrame : `${BASE_URL}${profile.avatarFrame}` }}
                  style={styles.avatarFrameImage}
                  resizeMode="contain"
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
                  colors={['#667eea', '#764ba2']}
                  style={styles.simpleDefaultAvatar}
                >
                  <Text style={styles.avatarText}>
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
                <Text style={styles.username}>{profile.username}</Text>
                <LinearGradient
                  colors={['#9333ea', '#dc2626']}
                  style={styles.levelBadgeCapsule}
                >
                  <Text style={styles.levelBadgeText}>Lv {profile.level || 1}</Text>
                </LinearGradient>
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
              <Text style={styles.userRole}></Text>
            </View>

            {/* Follow Stats */}
            <View style={styles.followStatsContainer}>
              <TouchableOpacity style={styles.followStatItem}>
                <Text style={styles.followStatText}>
                  Ikuti <Text style={styles.followStatNumber}>[{profile.followers || followersCount || 0}]</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.followStatItem}>
                <Text style={styles.followStatText}>
                  Mengikuti <Text style={styles.followStatNumber}>[{profile.following || followingCount || 0}]</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bio */}
            {profile.bio && (
              <Text style={styles.bio}>{profile.bio}</Text>
            )}

            {/* Family Badge with enhanced gradient */}
            {familyBadge && (
              <TouchableOpacity 
                style={styles.familyBadgeContainer}
                onPress={() => navigation.navigate('FamilyDetailScreen', { familyId: familyBadge.familyId })}
              >
                <LinearGradient
                  colors={['#9333ea', '#dc2626']}
                  style={styles.familyBadge}
                >
                  <View style={styles.familyBadgeIcon}>
                    <View style={styles.familyIconCircle}>
                      <Ionicons name="diamond" size={14} color="#9333ea" />
                    </View>
                  </View>
                  <Text style={styles.familyBadgeName} numberOfLines={1}>
                    {familyBadge.familyName}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Achievements */}
          {profile.achievements && profile.achievements.length > 0 && (
            <View style={styles.achievementsSection}>
              <Text style={styles.sectionTitle}>Pencapaian</Text>
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
              <TouchableOpacity onPress={handleFollow} style={styles.followButtonContainer}>
                <LinearGradient
                  colors={isFollowing ? ['#9333ea', '#dc2626'] : ['#9333ea', '#dc2626']}
                  style={styles.followButton}
                >
                  <Ionicons 
                    name={isFollowing ? "checkmark-circle" : "person-add"} 
                    size={16} 
                    color="#fff" 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.followButtonText}>
                    {isFollowing ? 'Mengikuti' : 'Ikuti'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                <LinearGradient
                  colors={['#9333ea', '#dc2626']}
                  style={styles.messageButtonGradient}
                >
                  <Ionicons name="chatbubble" size={16} color="#fff" />
                  <Text style={styles.messageButtonText}>Pesan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Album Photos */}
          {albumPhotos.length > 0 && (
            <View style={styles.albumSection}>
              <Text style={styles.sectionTitle}>Album</Text>
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
              <Text style={styles.sectionTitle}>Hadiah yang Diterima</Text>
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
              <View style={styles.busyStatusSection}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
                  style={styles.busyStatusGradient}
                >
                  <View style={styles.busyStatusHeader}>
                    <Text style={styles.busyStatusTitle}>Busy Status</Text>
                    <TouchableOpacity
                      style={styles.busyToggle}
                      onPress={handleBusyToggle}
                    >
                      <View style={[styles.toggleSwitch, isBusy && styles.toggleSwitchActive]}>
                        <View style={[styles.toggleThumb, isBusy && styles.toggleThumbActive]} />
                      </View>
                      <Text style={styles.busyToggleText}>
                        {isBusy ? 'Busy' : 'Available'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isBusy && (
                    <TouchableOpacity
                      style={styles.busyMessageButton}
                      onPress={() => setShowBusyModal(true)}
                    >
                      <Ionicons name="create-outline" size={16} color="#666" />
                      <Text style={styles.busyMessageText}>{busyMessage}</Text>
                    </TouchableOpacity>
                  )}
                </LinearGradient>
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.saveButtonContainer}
                  onPress={() => navigation.navigate('EditProfile')} 
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2']}
                    style={styles.saveButton}
                  >
                    <Text style={styles.saveButtonText}>
                      {loading ? 'Saving...' : 'Edit Profile'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => navigation.goBack()} 
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
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
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']}
            style={styles.busyModalContainer}
          >
            <View style={styles.busyModalHeader}>
              <Text style={styles.busyModalTitle}>Edit Busy Message</Text>
              <TouchableOpacity onPress={() => setShowBusyModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.busyModalContent}>
              <Text style={styles.busyModalLabel}>Message to show when others try to chat:</Text>
              <TextInput
                style={styles.busyMessageInput}
                value={busyMessage}
                onChangeText={setBusyMessage}
                placeholder="Enter busy message"
                multiline={true}
                maxLength={255}
              />

              <View style={styles.busyModalActions}>
                <TouchableOpacity
                  style={styles.busyModalCancelButton}
                  onPress={() => setShowBusyModal(false)}
                >
                  <Text style={styles.busyModalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBusyMessageUpdate}
                >
                  <LinearGradient
                    colors={['#007AFF', '#0051D0']}
                    style={styles.busyModalSaveButton}
                  >
                    <Text style={styles.busyModalSaveText}>Save</Text>
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
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.9)']}
            style={styles.backgroundMenuContainer}
          >
            <View style={styles.backgroundMenuContent}>
              <Text style={styles.backgroundMenuTitle}>Set as Background</Text>
              
              {selectedPhotoForBackground && (
                <>
                  <TouchableOpacity
                    style={styles.backgroundMenuButton}
                    onPress={() => handleSaveAsBackground(selectedPhotoForBackground)}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.backgroundMenuButtonGradient}
                    >
                      <Text style={styles.backgroundMenuButtonText}>Save to Background</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.backgroundMenuCancel}
                    onPress={() => {
                      setShowBackgroundMenu(false);
                      setSelectedPhotoForBackground(null);
                    }}
                  >
                    <Text style={styles.backgroundMenuCancelText}>Cancel</Text>
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
    backgroundColor: '#fff',
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
    shadowColor: '#000',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#333',
    fontSize: 16,
  },
  backgroundImageContainer: {
    height: 300,
    position: 'relative',
    backgroundColor: '#fff',
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
    shadowColor: '#000',
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
    backgroundColor: '#fff',
    marginRight: 8,
  },
  livingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  profileContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    paddingTop: 25,
    paddingHorizontal: 20,
    shadowColor: '#000',
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
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#667eea',
    shadowColor: '#000',
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
    color: '#fff',
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
    color: '#2c3e50',
    fontSize: 26,
    fontWeight: 'bold',
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
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  genderIcon: {
    width: 24,
    height: 24,
  },
  userRole: {
    color: '#FF6B35',
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
    color: '#2c3e50',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  followStatNumber: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bio: {
    color: '#7f8c8d',
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
    shadowColor: '#000',
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
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  familyBadgeName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flex: 1,
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
    shadowColor: '#9333ea',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageButton: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#dc2626',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  albumSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
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
    shadowColor: '#000',
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
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginRight: 15,
    alignItems: 'center',
    minWidth: 70,
    shadowColor: '#000',
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
    color: '#2c3e50',
  },
  achievementsSection: {
    marginBottom: 30,
  },
  achievementsContainer: {
    paddingRight: 20,
  },
  achievementItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginRight: 15,
    alignItems: 'center',
    minWidth: 90,
    shadowColor: '#000',
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
    color: '#2c3e50',
    textAlign: 'center',
  },
  achievementCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF6B35',
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
    shadowColor: '#667eea',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    paddingHorizontal: 35,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cancelButtonText: {
    color: '#7f8c8d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Busy status styles
  busyStatusSection: {
    marginBottom: 25,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
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
    color: '#2c3e50',
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
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    padding: 3,
  },
  toggleSwitchActive: {
    backgroundColor: '#4CAF50',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    shadowColor: '#000',
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
    color: '#2c3e50',
  },
  busyMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    gap: 10,
  },
  busyMessageText: {
    flex: 1,
    fontSize: 14,
    color: '#7f8c8d',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  busyModalContainer: {
    borderRadius: 20,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
    shadowColor: '#000',
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
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  busyModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  busyModalContent: {
    padding: 25,
  },
  busyModalLabel: {
    fontSize: 16,
    color: '#7f8c8d',
    marginBottom: 15,
  },
  busyMessageInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: '#2c3e50',
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(255,255,255,0.9)',
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
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  busyModalCancelText: {
    fontSize: 16,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  busyModalSaveButton: {
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 12,
  },
  busyModalSaveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  // Background editing styles
  editBackgroundButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
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
    shadowColor: '#000',
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
    color: '#2c3e50',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backgroundMenuCancel: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  backgroundMenuCancelText: {
    color: '#7f8c8d',
    fontSize: 16,
    fontWeight: '600',
  },
});
