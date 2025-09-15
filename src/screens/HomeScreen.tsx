import React, { useState, useEffect } from 'react';
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
  Platform,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

type StatusType = 'online' | 'offline' | 'away' | 'busy';

interface Friend {
  id: string;
  name: string;
  status: StatusType;
  lastSeen?: string;
  avatar?: string;
}

// Placeholder for Room type, assuming it's defined elsewhere
interface Room {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
}

const HomeScreen = ({ navigation }: any) => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState(0);
  const [userStatus, setUserStatus] = useState<StatusType>('online');
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showFriendMenu, setShowFriendMenu] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [userBalance, setUserBalance] = useState(0);
  const { token } = useAuth();


  // Fetch friends from server
  const fetchFriends = async () => {
    try {
      setLoading(true);
      console.log('Fetching friends from:', `${API_BASE_URL}/api/friends`);

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Friends response status:', response.status);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error('Non-JSON response for friends:', errorText.substring(0, 500));
        throw new Error(`Server returned HTML error page. Status: ${response.status}`);
      }

      if (response.ok) {
        const friendsData = await response.json();
        console.log('Friends data received:', friendsData.length, 'friends');
        setFriends(friendsData);
      } else {
        const errorData = await response.json();
        console.error('Friends fetch failed:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
      // Set empty array instead of showing alert for better UX
      setFriends([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch rooms from server (assuming this function exists and is needed)
  const fetchRooms = async () => {
    try {
      console.log('Fetching rooms from:', `${API_BASE_URL}/api/rooms`);

      const response = await fetch(`${API_BASE_URL}/api/rooms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Rooms response status:', response.status);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error('Non-JSON response for rooms:', errorText.substring(0, 500));
        throw new Error(`Server returned HTML error page. Status: ${response.status}`);
      }

      if (response.ok) {
        const roomsData = await response.json();
        console.log('Rooms data received:', roomsData.length, 'rooms');
        setRooms(roomsData);
      } else {
        const errorData = await response.json();
        console.error('Rooms fetch failed:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      // Set empty array instead of showing alert
      setRooms([]);
    }
  };

  // Search users
  const searchUsers = async (query: string) => {
    try {
      if (!token) {
        console.log('No token available for user search');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('User search response status:', response.status);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error('Non-JSON response for user search:', errorText.substring(0, 500));
        throw new Error(`Server returned HTML error page. Status: ${response.status}`);
      }

      if (response.ok) {
        const usersData = await response.json();
        setFriends(usersData); // Use friends state to display search results
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search users');
      }
    } catch (error) {
      console.error('Error searching users:', error);
      // Don't show alert for better UX, just log the error
      setFriends([]);
    }
  };

  // Search friends
  const searchFriends = async (query: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/search?query=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const friendsData = await response.json();
        setFriends(friendsData);
      } else {
        throw new Error('Failed to search friends');
      }
    } catch (error) {
      console.error('Error searching friends:', error);
      Alert.alert('Error', 'Failed to search friends');
    }
  };

  // Update user status
  const updateUserStatus = async (newStatus: StatusType) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setUserStatus(newStatus);
      } else {
        throw new Error('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  // Load friends and rooms on component mount
  useEffect(() => {
    fetchRooms();
    fetchFriends();
    fetchActiveUsers();
    fetchNotifications();
    fetchUserBalance();

    // Set up notification polling for real-time updates
    const notificationInterval = setInterval(() => {
      fetchNotifications();
    }, 30000); // Poll every 30 seconds

    return () => {
      clearInterval(notificationInterval);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadNotifications(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchActiveUsers = async () => {
    try {
      // Mock active users for now - in real app, get from admin dashboard
      setActiveUsers(Math.floor(Math.random() * 100) + 50);
    } catch (error) {
      console.error('Error fetching active users:', error);
      setActiveUsers(75); // Default fallback
    }
  };

  const fetchUserBalance = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/credits/balance`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserBalance(data.balance || 0);
      } else {
        console.error('Failed to fetch user balance');
        setUserBalance(0);
      }
    } catch (error) {
      console.error('Error fetching user balance:', error);
      setUserBalance(0);
    }
  };

  // Handle search with debounce
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchText.trim() && searchText.length >= 2) {
        // Search users when query has 2 or more characters
        searchUsers(searchText);
      } else if (searchText.trim() && searchText.length === 1) {
        // Keep existing friends list for single character
        return;
      } else {
        // Load friends when search is empty
        fetchFriends();
      }
    }, 300); // Reduced delay for faster response

    return () => clearTimeout(delayedSearch);
  }, [searchText]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFriends();
    await fetchRooms(); // Also refresh rooms on pull-to-refresh
    await fetchActiveUsers(); // Also refresh active users
    await fetchUserBalance(); // Also refresh user balance
    setRefreshing(false);
  };

  const getStatusColor = (status: StatusType): string => {
    switch (status) {
      case 'online': return '#4CAF50';
      case 'away': return '#FF9800';
      case 'busy': return '#F44336';
      case 'offline': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getStatusText = (status: StatusType) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'away': return 'Away';
      case 'busy': return 'Busy';
      default: return 'Offline';
    }
  };

  const getRandomAvatarColor = (name: string) => {
    const colors = [
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

    // Use first character to determine color consistently
    const firstChar = name?.charAt(0).toUpperCase() || 'A';
    const index = firstChar.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Active now';

    // If it's already a formatted string like "3 minutes ago", return as is
    if (typeof lastSeen === 'string' && (lastSeen.includes('ago') || lastSeen.includes('Active') || lastSeen.includes('Recently'))) {
      return lastSeen;
    }

    // Convert to string if it's not already
    const lastSeenStr = String(lastSeen);
    
    // Check if it's a very long number (timestamp)
    if (/^\d{10,}$/.test(lastSeenStr)) {
      const timestamp = parseInt(lastSeenStr);
      let lastSeenDate;
      
      // If it's more than 13 digits, likely microseconds - convert to milliseconds
      if (lastSeenStr.length > 13) {
        lastSeenDate = new Date(Math.floor(timestamp / 1000));
      } 
      // If it's 13 digits, it's milliseconds
      else if (lastSeenStr.length === 13) {
        lastSeenDate = new Date(timestamp);
      }
      // If it's 10 digits, it's seconds - convert to milliseconds
      else if (lastSeenStr.length === 10) {
        lastSeenDate = new Date(timestamp * 1000);
      }
      else {
        // Default case for other lengths
        lastSeenDate = new Date(timestamp);
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
    }

    // Handle regular numeric values (likely minutes)
    const numericValue = parseFloat(lastSeenStr);
    if (!isNaN(numericValue) && numericValue < 100000) {
      const minutes = Math.round(numericValue);
      
      if (minutes < 1) return 'Active now';
      if (minutes < 60) return `${minutes} min ago`;
      if (minutes < 1440) {
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
      }
      const days = Math.floor(minutes / 1440);
      return `${days}d ago`;
    }

    // Try to parse as a date string
    const lastSeenDate = new Date(lastSeenStr);
    if (!isNaN(lastSeenDate.getTime())) {
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
    }

    return 'Recently';
  };

  const toggleStatus = () => {
    const statuses: StatusType[] = ['online', 'away', 'busy', 'offline'];
    const currentIndex = statuses.indexOf(userStatus);
    const nextIndex = (currentIndex + 1) % statuses.length;
    updateUserStatus(statuses[nextIndex]);
  };

  // Add friend function
  const addFriend = async (userId: string, username: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/friends/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ friendId: userId }),
      });

      if (response.ok) {
        Alert.alert('Success', `Friend request sent to ${username}`);
        // Refresh friends list
        fetchFriends();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to add friend');
      }
    } catch (error) {
      console.error('Error adding friend:', error);
      Alert.alert('Error', 'Failed to add friend');
    }
  };

  // Start chat function
  const startChat = async (userId: string, username: string) => {
    try {
      console.log('Creating private chat with user:', username, 'ID:', userId);

      const response = await fetch(`${API_BASE_URL}/api/chat/private`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          participants: [user?.username, username],
          initiatedBy: user?.username,
          targetUserId: userId
        }),
      });

      console.log('Private chat response status:', response.status);

      if (response.ok) {
        const chatData = await response.json();
        console.log('Private chat created/found:', chatData.id);

        // Create proper targetUser object
        const targetUser = {
          id: userId,
          username: username,
          role: 'user',
          level: 1,
          avatar: null
        };

        navigation.navigate('Chat', {
          roomId: chatData.id,
          roomName: `Chat with ${username}`,
          roomDescription: `Private chat with ${username}`,
          type: 'private',
          targetUser: targetUser,
          autoFocusTab: true
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to create private chat:', errorData);
        Alert.alert('Error', errorData.error || 'Failed to start chat');
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      Alert.alert('Error', 'Network error. Failed to start chat');
    }
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
        username: selectedFriend.name 
      } as never);
    }
  };

  const handleStartChat = () => {
    if (selectedFriend) {
      setShowFriendMenu(false);
      // Add small delay to allow modal to close
      setTimeout(() => {
        startChat(selectedFriend.id, selectedFriend.name);
      }, 100);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedFriend) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${selectedFriend.id}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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
              const response = await fetch(`${API_BASE_URL}/api/users/${selectedFriend.id}/report`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
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

  const renderFriend = (friend: Friend) => {
    // Determine avatar display logic
    let avatarDisplay;
    const avatarUri = friend.avatar;
    
    // Check if avatar is a valid URL or server path
    const isValidAvatar = avatarUri && (
      avatarUri.startsWith('http') || 
      avatarUri.startsWith('https') || 
      avatarUri.startsWith('/api/users/avatar/') ||
      avatarUri.startsWith(`${API_BASE_URL}/api/users/avatar/`)
    );

    if (isValidAvatar) {
      // Construct proper URL if it's a server path
      let fullAvatarUrl = avatarUri;
      if (avatarUri.startsWith('/api/users/avatar/')) {
        fullAvatarUrl = `${API_BASE_URL}${avatarUri}`;
      }
      
      avatarDisplay = (
        <Image 
          source={{ uri: fullAvatarUrl }} 
          style={styles.friendAvatar}
          onError={(error) => {
            console.log('Failed to load avatar:', fullAvatarUrl, error.nativeEvent?.error);
          }}
        />
      );
    } else {
      // Show default avatar with first letter
      avatarDisplay = (
        <View style={[styles.friendAvatar, { backgroundColor: getRandomAvatarColor(friend.name) }]}>
          <Text style={styles.friendAvatarText}>
            {friend.name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
      );
    }

    return (
      <View key={friend.id} style={styles.friendCard}>
        <TouchableOpacity 
          style={styles.friendInfo}
          onPress={() => handleFriendPress(friend)}
          activeOpacity={0.7}
        >
          <View style={styles.friendAvatarContainer}>
            {avatarDisplay}
            <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(friend.status) }]} />
          </View>
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{friend.name}</Text>
            <Text style={styles.friendStatus}>{formatLastSeen(friend.lastSeen)}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actionButtons}>
          {/* Show action buttons only when searching users (not friends) */}
          {searchText.length >= 2 ? (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => addFriend(friend.id, friend.name)}
              >
                <Ionicons name="person-add" size={20} color="#4CAF50" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => startChat(friend.id, friend.name)}
              >
                <Ionicons name="chatbubble" size={20} color="#2196F3" />
              </TouchableOpacity>
            </>
          ) : (
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(friend.status) }]} />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Avatar and Controls */}
      <LinearGradient
        colors={['#8B5CF6', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.userInfo}>
          <View style={styles.userAvatarContainer}>
            <View style={styles.userAvatar}>
              {user?.avatar ? (
                <Image source={{ uri: `${API_BASE_URL}${user.avatar}` }} style={styles.userAvatarImage} />
              ) : (
                <Text style={styles.userAvatarText}>
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              )}
            </View>
            <View style={[styles.userStatusIndicator, { backgroundColor: getStatusColor(userStatus) }]} />
          </View>
          <View style={styles.userDetails}>
            <View style={styles.usernameRow}>
              <TouchableOpacity 
                style={[styles.iconButton, styles.notificationButton]} 
                onPress={() => navigation.navigate('Notifications')}
              >
                <Ionicons name="notifications" size={20} color="#fff" />
                {unreadNotifications > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationText}>
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.username}>{user?.username || 'developer'}</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Lv. {user?.level || 1}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerControls}>
          <TouchableOpacity style={styles.controlButton} onPress={toggleStatus}>
            <View style={[styles.statusIndicatorLarge, { backgroundColor: getStatusColor(userStatus) }]} />
            <Text style={styles.statusLabel}>{getStatusText(userStatus)}</Text>
          </TouchableOpacity>

          <View style={styles.coinBalance}>
            <Ionicons name="logo-bitcoin" size={20} color="#FFD700" />
            <Text style={styles.coinText}>{userBalance.toLocaleString()}</Text>
          </View>

          <View style={styles.activeUsersContainer}>
            <Ionicons name="people" size={16} color="#4CAF50" />
            <Text style={styles.activeUsersText}>{activeUsers}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Friends Section */}
      <View style={styles.friendsSection}>
        <View style={styles.friendsHeader}>
          <Text style={styles.friendsTitle}>Friends</Text>
          <View style={styles.friendsControls}>
            <TouchableOpacity 
              style={styles.trophyButton}
              onPress={() => navigation.navigate('TopRank')}
            >
              <Ionicons name="trophy" size={20} color="#FF9800" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.refreshButton} onPress={fetchFriends}>
              <Ionicons name="refresh" size={20} color="#9C27B0" />
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users... (min 2 characters)"
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#999"
          />
          {searchText.length >= 2 && (
            <View style={styles.searchTypeIndicator}>
              <Text style={styles.searchTypeText}>Users</Text>
            </View>
          )}
        </View>

        <ScrollView
          style={styles.friendsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading && friends.length === 0 ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading friends...</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color="#ccc" />
              <Text style={styles.emptyTitle}>
                {searchText.length >= 2 ? 'No Users Found' : 'No Friends Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchText.length >= 2
                  ? 'No users match your search term'
                  : searchText.length === 1
                  ? 'Type at least 2 characters to search users'
                  : 'Start adding friends to see them here'}
              </Text>
            </View>
          ) : (
            friends.map(renderFriend)
          )}
        </ScrollView>
      </View>

      {/* Friend Context Menu Modal */}
      <Modal
        visible={showFriendMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFriendMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFriendMenu(false)}
        >
          <View style={styles.friendContextMenu}>
            <View style={styles.friendMenuHeader}>
              <View style={[styles.friendMenuAvatar, { backgroundColor: selectedFriend ? getRandomAvatarColor(selectedFriend.name) : '#9E9E9E' }]}>
                {selectedFriend?.avatar ? (
                  <Image source={{ uri: selectedFriend.avatar }} style={styles.friendMenuAvatarImage} />
                ) : (
                  <Text style={styles.friendMenuAvatarText}>
                    {selectedFriend?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                )}
              </View>
              <Text style={styles.friendMenuName}>{selectedFriend?.name}</Text>
            </View>

            <TouchableOpacity
              style={styles.friendMenuItem}
              onPress={handleStartChat}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#2196F3" />
              <Text style={styles.friendMenuText}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.friendMenuItem}
              onPress={handleViewProfile}
            >
              <Ionicons name="person-outline" size={20} color="#333" />
              <Text style={styles.friendMenuText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.friendMenuItem}
              onPress={handleBlockUser}
            >
              <Ionicons name="ban-outline" size={20} color="#FF9800" />
              <Text style={[styles.friendMenuText, { color: '#FF9800' }]}>Block</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.friendMenuItem, styles.lastFriendMenuItem]}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color="#F44336" />
              <Text style={[styles.friendMenuText, { color: '#F44336' }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatarContainer: {
    position: 'relative',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  userAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  userStatusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  levelBadge: {
    backgroundColor: '#9C27B0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  levelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  statusIndicatorLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
  },
  iconButton: {
    padding: 8,
    marginLeft: 8,
  },
  friendsSection: {
    flex: 1,
    padding: 20,
  },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  friendsTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  friendsControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trophyButton: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF9800',
    marginRight: 10,
  },
  refreshButton: {
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#9C27B0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshText: {
    color: '#9C27B0',
    marginLeft: 5,
    fontSize: 14,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  searchTypeIndicator: {
    backgroundColor: '#9C27B0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  searchTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  friendsList: {
    flex: 1,
  },
  friendCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendAvatarContainer: {
    position: 'relative',
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  friendDetails: {
    marginLeft: 12,
    flex: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  friendStatus: {
    fontSize: 14,
    color: '#666',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Styles for header added for active users display
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeUsersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  activeUsersText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  coinBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  coinText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  // Friend Context Menu Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendContextMenu: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  friendMenuHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  friendMenuAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  friendMenuAvatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  friendMenuAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  friendMenuName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  friendMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  lastFriendMenuItem: {
    borderBottomWidth: 0,
  },
  friendMenuText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#333',
  },
});

export default HomeScreen;