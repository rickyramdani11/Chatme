
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';
import { useTheme } from '../contexts/ThemeContext';


type StatusType = 'online' | 'offline' | 'away' | 'busy';
type StatusFilterType = 'all' | StatusType;

interface Friend {
  id: string;
  name: string;
  username: string;
  status: StatusType;
  lastSeen?: string;
  avatar?: string;
  role?: string;
}

export default function FriendsScreen() {
  const { user, token: authToken } = useAuth();
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFriendMenu, setShowFriendMenu] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');

  const themedStyles = useMemo(() => createThemedStyles(colors, isDarkMode), [colors, isDarkMode]);

  const getStatusColor = (status: StatusType): string => {
    switch (status) {
      case 'online': return colors.success;
      case 'away': return colors.warning;
      case 'busy': return colors.error;
      case 'offline': return colors.textSecondary;
      default: return colors.textSecondary;
    }
  };

  const getRandomAvatarColor = (name: string) => {
    const avatarColors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#96CEB4', // Green
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Mint
      '#F7DC6F', // Gold
      '#BB8FCE', // Purple
      '#85C1E9', // Light Blue
      '#82E0AA', // Light Green
      '#F8C471'  // Orange
    ];
    
    const firstChar = name?.charAt(0).toUpperCase() || 'A';
    const index = firstChar.charCodeAt(0) % avatarColors.length;
    return avatarColors[index];
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return colors.error;
      case 'mentor': return colors.primary;
      case 'merchant': return colors.warning;
      case 'user':
      default: return colors.text;
    }
  };

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Active now';
    
    // If it's already a formatted string like "3 minutes ago", return as is
    if (lastSeen.includes('ago') || lastSeen.includes('Active') || lastSeen.includes('Recently')) {
      return lastSeen;
    }
    
    // Handle very long numeric values (likely milliseconds or large numbers)
    const numericValue = parseFloat(lastSeen);
    if (!isNaN(numericValue)) {
      let minutes = numericValue;
      
      // If it's a very large number, assume it's milliseconds since epoch
      if (numericValue > 1000000000000) {
        const lastSeenDate = new Date(numericValue);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenDate.getTime();
        minutes = Math.floor(diffMs / 1000 / 60);
      } else if (numericValue > 60 * 24 * 365) {
        // If it's more than a year in minutes, probably seconds since epoch
        const lastSeenDate = new Date(numericValue * 1000);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenDate.getTime();
        minutes = Math.floor(diffMs / 1000 / 60);
      } else {
        // Fix the decimal issue by rounding properly
        minutes = Math.round(numericValue);
      }
      
      if (minutes < 1) return 'Active now';
      if (minutes < 60) return `${minutes} min ago`;
      if (minutes < 1440) {
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
      }
      const days = Math.floor(minutes / 1440);
      return `${days}d ago`;
    }
    
    // Try to parse as a date
    const lastSeenDate = new Date(lastSeen);
    if (isNaN(lastSeenDate.getTime())) {
      return 'Recently';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMinutes = Math.floor(diffMs / 1000 / 60);

    if (diffMinutes < 1) return 'Active now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}h ago`;
    }
    const days = Math.floor(diffMinutes / 1440);
    return `${days}d ago`;
  };

  const fetchFriends = async () => {
    if (!user?.username || !authToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/friends`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Transform the data to match our Friend interface
        const transformedFriends = data.map((friend: any) => ({
          id: friend.id?.toString() || friend.user_id?.toString(),
          name: friend.name || friend.username,
          username: friend.username,
          status: (friend.status || 'offline').toLowerCase() as StatusType,
          lastSeen: friend.last_seen || friend.lastSeen || 'Recently',
          avatar: friend.avatar && friend.avatar.startsWith('/api/') ? `${BASE_URL}${friend.avatar}` : 
                  friend.avatar && friend.avatar.startsWith('http') ? friend.avatar : null,
          role: friend.role || 'user'
        }));
        
        setFriends(transformedFriends);
        // Fetch real-time status for each friend
        await fetchFriendsStatus(transformedFriends);
      } else {
        console.error('Failed to fetch friends:', response.status);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFriendsStatus = async (friendsList = friends) => {
    try {
      const updatedFriends = await Promise.all(
        friendsList.map(async (friend) => {
          try {
            const statusResponse = await fetch(`${API_BASE_URL}/user/${friend.id}/status`, {
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              const normalizedStatus = (statusData.status || 'offline').toLowerCase() as StatusType;
              console.log(`Status for ${friend.name}: ${normalizedStatus}`);
              return { ...friend, status: normalizedStatus };
            } else {
              console.log(`Failed to get status for ${friend.name}`);
              return { ...friend, status: 'offline' as StatusType };
            }
          } catch (error) {
            console.error(`Error fetching status for friend ${friend.name}:`, error);
            return { ...friend, status: 'offline' as StatusType };
          }
        })
      );

      setFriends(updatedFriends);
    } catch (error) {
      console.error('Error fetching friends status:', error);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      fetchFriends();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/users/search?query=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const transformedUsers = data.map((user: any) => ({
          id: user.id?.toString(),
          name: user.name || user.username,
          username: user.username,
          status: (user.status || 'offline').toLowerCase() as StatusType,
          lastSeen: user.last_seen || 'Recently',
          avatar: user.avatar && user.avatar.startsWith('/api/') ? `${BASE_URL}${user.avatar}` : 
                  user.avatar && user.avatar.startsWith('http') ? user.avatar : null,
          role: user.role || 'user'
        }));
        setFriends(transformedUsers);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const addFriend = async (friendId: string, friendName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${friendId}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        Alert.alert('Success', `Added ${friendName} as a friend!`);
        fetchFriends();
      } else {
        Alert.alert('Error', 'Failed to add friend');
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    }
  };

  const startChat = (friendId: string, friendName: string) => {
    navigation.navigate('Chat' as never, {
      roomId: `private_${user?.id}_${friendId}`,
      roomName: friendName,
      type: 'private',
      targetUser: { id: friendId, username: friendName }
    } as never);
  };

  const handleFriendPress = (friend: Friend) => {
    setSelectedFriend(friend);
    setShowFriendMenu(true);
  };

  const handleViewProfile = () => {
    if (selectedFriend) {
      setShowFriendMenu(false);
      navigation.navigate('Profile' as never, { 
        userId: selectedFriend.id,
        username: selectedFriend.username 
      } as never);
    }
  };

  const handleStartChat = () => {
    if (selectedFriend) {
      setShowFriendMenu(false);
      startChat(selectedFriend.id, selectedFriend.name);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedFriend) return;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedFriend.id}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        Alert.alert('Success', `${selectedFriend.name} has been blocked`);
        setShowFriendMenu(false);
        fetchFriends(); // Refresh friends list
      } else {
        Alert.alert('Error', 'Failed to block user');
      }
    } catch (error) {
      console.error('Error blocking user:', error);
      Alert.alert('Error', 'Failed to block user');
    }
  };

  const handleSendCredit = () => {
    if (selectedFriend) {
      setShowFriendMenu(false);
      navigation.navigate('Credit' as never, { 
        recipientId: selectedFriend.id,
        recipientName: selectedFriend.name 
      } as never);
    }
  };

  const handleReportUser = async () => {
    if (!selectedFriend) return;

    Alert.alert(
      'Report User',
      `Are you sure you want to report ${selectedFriend.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/users/${selectedFriend.id}/report`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${authToken}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
                body: JSON.stringify({
                  reason: 'inappropriate_behavior'
                })
              });

              if (response.ok) {
                Alert.alert('Success', `${selectedFriend.name} has been reported`);
                setShowFriendMenu(false);
              } else {
                Alert.alert('Error', 'Failed to report user');
              }
            } catch (error) {
              console.error('Error reporting user:', error);
              Alert.alert('Error', 'Failed to report user');
            }
          }
        }
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    setSearchText('');
    fetchFriends();
  };

  useEffect(() => {
    fetchFriends();
    
    // Set up periodic status updates every 30 seconds
    const statusInterval = setInterval(() => {
      if (friends.length > 0 && searchText.length < 2) {
        fetchFriendsStatus();
      }
    }, 30000);

    return () => clearInterval(statusInterval);
  }, [user, authToken]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchText);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  // Filter friends based on selected status
  const filteredFriends = friends.filter(friend => {
    if (statusFilter === 'all') return true;
    return friend.status === statusFilter;
  });

  const renderFriend = (friend: Friend) => (
    <View key={friend.id} style={themedStyles.friendCard}>
      <TouchableOpacity 
        style={themedStyles.friendInfo}
        onPress={() => handleFriendPress(friend)}
        activeOpacity={0.7}
      >
        <View style={themedStyles.friendAvatarContainer}>
          {friend.avatar ? (
            <Image 
              source={{ uri: friend.avatar }} 
              style={themedStyles.friendAvatar}
              onError={() => console.log('Failed to load avatar:', friend.avatar)}
            />
          ) : (
            <View style={[themedStyles.friendAvatar, { backgroundColor: getRandomAvatarColor(friend.name || friend.username) }]}>
              <Text style={themedStyles.friendAvatarText}>
                {friend.name?.charAt(0).toUpperCase() || friend.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View style={[themedStyles.statusIndicator, { backgroundColor: getStatusColor(friend.status) }]} />
        </View>
        <View style={themedStyles.friendDetails}>
          <Text style={[themedStyles.friendName, { color: getRoleColor(friend.role || 'user') }]}>{friend.name}</Text>
          <Text style={themedStyles.friendStatus}>{formatLastSeen(friend.lastSeen)}</Text>
        </View>
      </TouchableOpacity>
      
      <View style={themedStyles.actionButtons}>
        {searchText.length >= 2 ? (
          <>
            <TouchableOpacity
              style={themedStyles.actionButton}
              onPress={() => addFriend(friend.id, friend.name)}
            >
              <Ionicons name="person-add" size={20} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              style={themedStyles.actionButton}
              onPress={() => startChat(friend.id, friend.name)}
            >
              <Ionicons name="chatbubble" size={20} color={colors.info} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={themedStyles.actionButton}
            onPress={() => startChat(friend.id, friend.name)}
          >
            <Ionicons name="chatbubble" size={20} color={colors.info} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={themedStyles.container}>
      {/* Header */}
      <LinearGradient
        colors={isDarkMode ? [colors.primary, colors.primary] : ['#667eea', '#764ba2']}
        style={themedStyles.header}
      >
        <View style={themedStyles.headerContent}>
          <Text style={themedStyles.headerTitle}>Friends</Text>
          <Text style={themedStyles.headerSubtitle}>Connect with your friends</Text>
        </View>
        
        {/* Status Filter Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={themedStyles.statusFilterContainer}
          contentContainerStyle={themedStyles.statusFilterContent}
        >
          <TouchableOpacity
            style={[themedStyles.statusFilterTab, statusFilter === 'all' && themedStyles.statusFilterTabActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[themedStyles.statusFilterText, statusFilter === 'all' && themedStyles.statusFilterTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[themedStyles.statusFilterTab, statusFilter === 'online' && themedStyles.statusFilterTabActive]}
            onPress={() => setStatusFilter('online')}
          >
            <View style={[themedStyles.statusFilterDot, { backgroundColor: colors.success }]} />
            <Text style={[themedStyles.statusFilterText, statusFilter === 'online' && themedStyles.statusFilterTextActive]}>
              Online
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[themedStyles.statusFilterTab, statusFilter === 'offline' && themedStyles.statusFilterTabActive]}
            onPress={() => setStatusFilter('offline')}
          >
            <View style={[themedStyles.statusFilterDot, { backgroundColor: colors.textSecondary }]} />
            <Text style={[themedStyles.statusFilterText, statusFilter === 'offline' && themedStyles.statusFilterTextActive]}>
              Offline
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[themedStyles.statusFilterTab, statusFilter === 'away' && themedStyles.statusFilterTabActive]}
            onPress={() => setStatusFilter('away')}
          >
            <View style={[themedStyles.statusFilterDot, { backgroundColor: colors.warning }]} />
            <Text style={[themedStyles.statusFilterText, statusFilter === 'away' && themedStyles.statusFilterTextActive]}>
              Away
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[themedStyles.statusFilterTab, statusFilter === 'busy' && themedStyles.statusFilterTabActive]}
            onPress={() => setStatusFilter('busy')}
          >
            <View style={[themedStyles.statusFilterDot, { backgroundColor: colors.error }]} />
            <Text style={[themedStyles.statusFilterText, statusFilter === 'busy' && themedStyles.statusFilterTextActive]}>
              Busy
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>

      {/* Search */}
      <View style={themedStyles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.iconDefault} style={themedStyles.searchIcon} />
        <TextInput
          style={themedStyles.searchInput}
          placeholder="Search friends or users..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={colors.textSecondary}
        />
        {searchText.length >= 2 && (
          <View style={themedStyles.searchTypeIndicator}>
            <Text style={themedStyles.searchTypeText}>USERS</Text>
          </View>
        )}
      </View>

      {/* Friends List */}
      <ScrollView
        style={themedStyles.friendsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && friends.length === 0 ? (
          <View style={themedStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={themedStyles.loadingText}>Loading friends...</Text>
          </View>
        ) : filteredFriends.length === 0 ? (
          <View style={themedStyles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={colors.textSecondary} />
            <Text style={themedStyles.emptyTitle}>
              {searchText.length >= 2 ? 'No Users Found' : statusFilter !== 'all' ? `No ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Friends` : 'No Friends Found'}
            </Text>
            <Text style={themedStyles.emptySubtitle}>
              {searchText.length >= 2
                ? 'No users match your search term'
                : searchText.length === 1
                ? 'Type at least 2 characters to search users'
                : statusFilter !== 'all'
                ? `No friends are currently ${statusFilter}`
                : 'Start adding friends to see them here'}
            </Text>
          </View>
        ) : (
          filteredFriends.map(renderFriend)
        )}
      </ScrollView>

      {/* Friend Context Menu Modal */}
      <Modal
        visible={showFriendMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFriendMenu(false)}
      >
        <TouchableOpacity
          style={themedStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFriendMenu(false)}
        >
          <View style={themedStyles.friendContextMenu}>
            <View style={themedStyles.friendMenuHeader}>
              <View style={[themedStyles.friendMenuAvatar, { backgroundColor: selectedFriend ? getRandomAvatarColor(selectedFriend.name || selectedFriend.username) : colors.textSecondary }]}>
                {selectedFriend?.avatar ? (
                  <Image source={{ uri: selectedFriend.avatar }} style={themedStyles.friendMenuAvatarImage} />
                ) : (
                  <Text style={themedStyles.friendMenuAvatarText}>
                    {selectedFriend?.name?.charAt(0).toUpperCase() || selectedFriend?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <Text style={themedStyles.friendMenuName}>{selectedFriend?.name}</Text>
            </View>

            <TouchableOpacity
              style={themedStyles.friendMenuItem}
              onPress={handleStartChat}
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.info} />
              <Text style={themedStyles.friendMenuText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={themedStyles.friendMenuItem}
              onPress={handleViewProfile}
            >
              <Ionicons name="person-outline" size={20} color={colors.text} />
              <Text style={themedStyles.friendMenuText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={themedStyles.friendMenuItem}
              onPress={handleBlockUser}
            >
              <Ionicons name="ban-outline" size={20} color={colors.warning} />
              <Text style={[themedStyles.friendMenuText, { color: colors.warning }]}>Block</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={themedStyles.friendMenuItem}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color={colors.error} />
              <Text style={[themedStyles.friendMenuText, { color: colors.error }]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[themedStyles.friendMenuItem, themedStyles.lastFriendMenuItem]}
              onPress={handleSendCredit}
            >
              <Ionicons name="wallet-outline" size={20} color={colors.success} />
              <Text style={[themedStyles.friendMenuText, { color: colors.success }]}>Send Credit</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createThemedStyles = (colors: any, isDarkMode: boolean) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center' as const,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  statusFilterContainer: {
    marginTop: 15,
  },
  statusFilterContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  statusFilterTab: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)',
    marginRight: 10,
  },
  statusFilterTabActive: {
    backgroundColor: isDarkMode ? colors.card : '#fff',
  },
  statusFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusFilterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500' as const,
  },
  statusFilterTextActive: {
    color: isDarkMode ? colors.text : colors.primary,
    fontWeight: '600' as const,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.card,
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    margin: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  searchTypeIndicator: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  searchTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold' as const,
  },
  friendsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  friendCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  friendInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  friendAvatarContainer: {
    position: 'relative' as const,
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  friendAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  statusIndicator: {
    position: 'absolute' as const,
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.card,
  },
  friendDetails: {
    marginLeft: 12,
    flex: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginBottom: 2,
  },
  friendStatus: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  friendContextMenu: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    minWidth: 250,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  friendMenuHeader: {
    alignItems: 'center' as const,
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  friendMenuAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
  },
  friendMenuAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  friendMenuAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold' as const,
  },
  friendMenuName: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: colors.text,
  },
  friendMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginVertical: 2,
  },
  lastFriendMenuItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 15,
  },
  friendMenuText: {
    fontSize: 16,
    marginLeft: 15,
    color: colors.text,
    fontWeight: '500' as const,
  },
});
