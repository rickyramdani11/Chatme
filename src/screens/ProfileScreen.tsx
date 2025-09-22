import React, { useState, useEffect } from 'react';
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
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


interface UserProfile {
  id: string;
  username: string;
  bio: string;
  followers: number;
  following: number;
  avatar?: string;
  avatarFrame?: string;
  level: number;
  achievements: Achievement[];
  isOnline: boolean;
  country?: string;
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

export default function ProfileScreen({ navigation, route }: any) {
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [familyBadge, setFamilyBadge] = useState<FamilyBadge | null>(null);

  // State for busy status
  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('This user is busy');
  const [showBusyModal, setShowBusyModal] = useState(false);


  // State for reporting
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');

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
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/profile`, {
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
            profileData.avatar = `${API_BASE_URL}${profileData.avatar}`;
          } else if (!profileData.avatar.startsWith('http')) {
            // Handle case where avatar might be stored as relative path
            profileData.avatar = `${API_BASE_URL}${profileData.avatar}`;
          }
        }

        // Check if current user is following this profile (only if not own profile and user is authenticated)
        if (!isOwnProfile && token && user?.id) {
          try {
            const followCheckResponse = await fetch(`${API_BASE_URL}/api/users/${userId}/follow-status`, {
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
          const giftsResponse = await fetch(`${API_BASE_URL}/api/users/${userId}/gifts`, {
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
          const achievementsResponse = await fetch(`${API_BASE_URL}/api/users/${userId}/achievements`, {
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
            const busyResponse = await fetch(`${API_BASE_URL}/api/user/${user.username}/busy-status`, {
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
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/album`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (response.ok) {
        const photos = await response.json();
        setAlbumPhotos(photos);
      }
    } catch (error) {
      console.error('Error fetching album:', error);
    }
  };

  const fetchFamilyBadge = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/family-badge`, {
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

      const response = await fetch(`${API_BASE_URL}/api/users/${userId}/follow`, {
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
        const response = await fetch(`${API_BASE_URL}/api/chat/private`, {
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
          navigation.navigate('Chat', {
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
      const response = await fetch(`${API_BASE_URL}/api/user/busy-status`, {
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
      const response = await fetch(`${API_BASE_URL}/api/user/busy-status`, {
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


  const renderAlbumPhoto = ({ item }: { item: AlbumPhoto }) => (
    <View style={styles.albumPhotoItem}>
      <Image 
        source={{ uri: `${API_BASE_URL}${item.url}` }} 
        style={styles.albumPhotoImage} 
      />
    </View>
  );

  const renderGift = ({ item }: { item: Gift }) => (
    <View style={styles.giftItem}>
      <Text style={styles.giftIcon}>{item.icon}</Text>
      <Text style={styles.giftCount}>{item.count}</Text>
    </View>
  );

  const renderAchievement = ({ item }: { item: Achievement }) => (
    <View style={styles.achievementItem}>
      <Text style={styles.achievementIcon}>{item.icon}</Text>
      <Text style={styles.achievementName}>{item.name}</Text>
      {item.count && <Text style={styles.achievementCount}>{item.count}</Text>}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
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
      {/* Header with background image */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuButton}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Background Image Area */}
        <View style={styles.backgroundImageContainer}>
          <Image 
            source={{ 
              uri: albumPhotos.length > 0 
                ? `${API_BASE_URL}${albumPhotos[0].url}` 
                : 'https://images.unsplash.com/photo-1557804506-669a67965ba0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'
            }} 
            style={styles.backgroundImage} 
          />

          {/* Living Status */}
          {profile.isOnline && (
            <View style={styles.livingStatus}>
              <View style={styles.livingDot} />
              <Text style={styles.livingText}>Living</Text>
            </View>
          )}
        </View>

        {/* Profile Content */}
        <View style={styles.profileContent}>
          {/* Avatar with decorative frame */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarFrame}>
              {/* Avatar Frame Background */}
              {profile.avatarFrame && (
                <Image 
                  source={{ uri: `${API_BASE_URL}${profile.avatarFrame}` }} 
                  style={styles.avatarFrameImage}
                />
              )}
              
              <View style={styles.avatarInner}>
                {profile.avatar ? (
                  <Image 
                    source={{ uri: profile.avatar }} 
                    style={styles.avatar}
                    onError={(error) => {
                      console.log('Avatar loading failed:', error.nativeEvent.error);
                      // Reset avatar to null so fallback renders
                      setProfile(prev => prev ? { ...prev, avatar: null } : null);
                    }}
                  />
                ) : (
                  <View style={styles.defaultAvatar}>
                    <Text style={styles.avatarText}>
                      {profile.username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* User Info */}
          <View style={styles.userInfo}>
            <View style={styles.nameContainer}>
              <Text style={styles.username}>{profile.username}</Text>
              <Text style={styles.userRole}></Text>
            </View>

            {/* Country Flag */}
            {profile.country && (
              <View style={styles.countryContainer}>
                <Text style={styles.countryFlag}>🇮🇩</Text> 
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>ikuti</Text>
                <Text style={styles.statNumber}>{profile.following}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Pengemar</Text>
                <Text style={styles.statNumber}>{profile.followers}</Text>
              </View>
            </View>

            {/* Bio */}
            {profile.bio && (
              <Text style={styles.bio}>{profile.bio}</Text>
            )}

            {/* Family Badge */}
            {familyBadge && (
              <TouchableOpacity 
                style={[styles.familyBadge, { backgroundColor: getFamilyLevelColor(familyBadge.familyLevel) }]}
                onPress={() => navigation.navigate('FamilyDetailScreen', { familyId: familyBadge.familyId })}
              >
                <View style={styles.familyBadgeIcon}>
                  <View style={styles.familyIconCircle}>
                    <Ionicons name="diamond" size={16} color="#4A90E2" />
                  </View>
                </View>
                <Text style={styles.familyBadgeName} numberOfLines={1}>
                  {familyBadge.familyName}
                </Text>
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

          {/* Action Buttons */}
          {!isOwnProfile && (
            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={handleFollow}>
                <LinearGradient
                  colors={isFollowing ? ['#E0E0E0', '#BDBDBD'] : ['#FF69B4', '#FF1493']}
                  style={styles.followButton}
                >
                  <Text style={[
                    styles.followButtonText,
                    isFollowing && { color: '#666' }
                  ]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                <Ionicons name="chatbubble" size={16} color="#FF69B4" />
              </TouchableOpacity>
            </View>
          )}

          {/* Album Photos */}
          {albumPhotos.length > 0 && (
            <View style={styles.albumSection}>
              <Text style={styles.sectionTitle}>Album</Text>
              <FlatList
                data={albumPhotos.slice(0, 6)} // Show max 6 photos
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
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => navigation.navigate('EditProfile')} 
                  disabled={loading}
                >
                  <Text style={styles.saveButtonText}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Text>
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
        </View>
      </ScrollView>

      {/* Busy Message Modal */}
      <Modal
        visible={showBusyModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBusyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.busyModalContainer}>
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
                  style={styles.busyModalSaveButton}
                  onPress={handleBusyMessageUpdate}
                >
                  <Text style={styles.busyModalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
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
    color: '#333',
    fontSize: 16,
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
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  livingStatus: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF69B4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  livingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  livingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  profileContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    marginTop: -25,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    marginTop: -50,
    marginBottom: 20,
  },
  avatarFrame: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#FF69B4',
    padding: 2,
    backgroundColor: '#fff',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFrameImage: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 88,
    height: 88,
    borderRadius: 44,
    zIndex: 2,
    resizeMode: 'cover',
  },
  avatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    overflow: 'hidden',
    zIndex: 1,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  defaultAvatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  username: {
    color: '#333',
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 8,
  },
  userRole: {
    color: '#FF69B4',
    fontSize: 18,
    fontWeight: '600',
  },
  countryContainer: {
    marginBottom: 15,
  },
  countryFlag: {
    fontSize: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  statItem: {
    alignItems: 'center',
    marginHorizontal: 25,
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
    marginBottom: 2,
  },
  statNumber: {
    color: '#333',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bio: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    minWidth: 120,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  familyBadgeIcon: {
    marginRight: 8,
  },
  familyIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  familyBadgeName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 15,
  },
  followButton: {
    paddingHorizontal: 25,
    paddingVertical: 8,
    borderRadius: 20,
  },
  followButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  messageButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF69B4',
    padding: 8,
    borderRadius: 20,
  },
  albumSection: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  albumGrid: {
    gap: 8,
  },
  albumPhotoItem: {
    flex: 1,
    margin: 4,
  },
  albumPhotoImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
  },
  giftsSection: {
    marginBottom: 25,
  },
  giftsContainer: {
    paddingRight: 20,
  },
  giftItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 60,
  },
  giftIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  giftCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  ownProfileActions: {
    marginBottom: 30,
  },
  editButton: {
    backgroundColor: '#FF69B4',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Achievements styles
  achievementsSection: {
    marginBottom: 25,
  },
  achievementsContainer: {
    paddingRight: 20,
  },
  achievementItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    alignItems: 'center',
    minWidth: 80,
  },
  achievementIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  achievementName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  achievementCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FF69B4',
    marginTop: 2,
  },
  // Edit Profile Screen Styles (assuming these are relevant for context)
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#FF69B4',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Report Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  reportModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  reportModalContent: {
    padding: 20,
  },
  reportModalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  reportReasonInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
    minHeight: 50,
  },
  reportDescriptionInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  reportModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  reportModalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  reportModalCancelText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  reportModalSubmitButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FF69B4',
  },
  reportModalSubmitText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  // Busy status styles
  busyStatusSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  busyStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  busyStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  busyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    padding: 2,
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
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  busyToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  busyMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    gap: 8,
  },
  busyMessageText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  busyModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    maxWidth: 400,
    width: '90%',
  },
  busyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  busyModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  busyModalContent: {
    padding: 20,
  },
  busyModalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  busyMessageInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  busyModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  busyModalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  busyModalCancelText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  busyModalSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  busyModalSaveText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
});