
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
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL } from '../utils/apiConfig';


type StatusType = 'online' | 'offline' | 'away' | 'busy';

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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFriendMenu, setShowFriendMenu] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  const getStatusColor = (status: StatusType): string => {
    switch (status) {
      case 'online': return '#4CAF50';
      case 'away': return '#FF9800';
      case 'busy': return '#F44336';
      case 'offline': return '#9E9E9E';
      default: return '#9E9E9E';
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#FF6B35'; // Orange untuk admin
      case 'mentor': return '#9C27B0'; // Purple untuk mentor  
      case 'merchant': return '#FF9800'; // Amber untuk merchant
      case 'user':
      default: return '#333'; // Dark untuk user biasa
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
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Mask sensitive data for logging
        const maskedData = data.map((friend: any) => ({
          id: friend.id,
          name: friend.name,
          username: friend.username,
          status: friend.status,
          lastSeen: friend.lastSeen,
          avatar: friend.avatar ? '***avatar***' : null
        }));
        
        console.log('Friends data:', maskedData);
        
        // Transform the data to match our Friend interface
        const transformedFriends = data.map((friend: any) => ({
          id: friend.id?.toString() || friend.user_id?.toString(),
          name: friend.name || friend.username,
          username: friend.username,
          status: friend.status || 'offline',
          lastSeen: friend.last_seen || friend.lastSeen || 'Recently',
          avatar: friend.avatar && friend.avatar.startsWith('/api/') ? `${API_BASE_URL}${friend.avatar}` : 
                  friend.avatar && friend.avatar.startsWith('http') ? friend.avatar : null,
          role: friend.role || 'user'
        }));
        
        setFriends(transformedFriends);
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

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      fetchFriends();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`, {
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
          status: user.status || 'offline',
          lastSeen: user.last_seen || 'Recently',
          avatar: user.avatar && user.avatar.startsWith('/api/') ? `${API_BASE_URL}${user.avatar}` : 
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
      const response = await fetch(`${API_BASE_URL}/api/users/${friendId}/follow`, {
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
      const response = await fetch(`${API_BASE_URL}/api/users/${selectedFriend.id}/block`, {
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
              const response = await fetch(`${API_BASE_URL}/api/users/${selectedFriend.id}/report`, {
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
  }, [user, authToken]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchText);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const renderFriend = (friend: Friend) => (
    <View key={friend.id} style={styles.friendCard}>
      <TouchableOpacity 
        style={styles.friendInfo}
        onPress={() => handleFriendPress(friend)}
        activeOpacity={0.7}
      >
        <View style={styles.friendAvatarContainer}>
          {friend.avatar ? (
            <Image 
              source={{ uri: friend.avatar }} 
              style={styles.friendAvatar}
              onError={() => console.log('Failed to load avatar:', friend.avatar)}
            />
          ) : (
            <View style={[styles.friendAvatar, { backgroundColor: getRandomAvatarColor(friend.name || friend.username) }]}>
              <Text style={styles.friendAvatarText}>
                {friend.name?.charAt(0).toUpperCase() || friend.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(friend.status) }]} />
        </View>
        <View style={styles.friendDetails}>
          <Text style={[styles.friendName, { color: getRoleColor(friend.role || 'user') }]}>{friend.name}</Text>
          <Text style={styles.friendStatus}>{formatLastSeen(friend.lastSeen)}</Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.actionButtons}>
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
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => startChat(friend.id, friend.name)}
          >
            <Ionicons name="chatbubble" size={20} color="#2196F3" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Friends</Text>
          <Text style={styles.headerSubtitle}>Connect with your friends</Text>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends or users..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#999"
        />
        {searchText.length >= 2 && (
          <View style={styles.searchTypeIndicator}>
            <Text style={styles.searchTypeText}>USERS</Text>
          </View>
        )}
      </View>

      {/* Friends List */}
      <ScrollView
        style={styles.friendsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && friends.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
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
              <View style={[styles.friendMenuAvatar, { backgroundColor: selectedFriend ? getRandomAvatarColor(selectedFriend.name || selectedFriend.username) : '#9E9E9E' }]}>
                {selectedFriend?.avatar ? (
                  <Image source={{ uri: selectedFriend.avatar }} style={styles.friendMenuAvatarImage} />
                ) : (
                  <Text style={styles.friendMenuAvatarText}>
                    {selectedFriend?.name?.charAt(0).toUpperCase() || selectedFriend?.username?.charAt(0).toUpperCase() || 'U'}
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
              style={styles.friendMenuItem}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color="#F44336" />
              <Text style={[styles.friendMenuText, { color: '#F44336' }]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.friendMenuItem, styles.lastFriendMenuItem]}
              onPress={handleSendCredit}
            >
              <Ionicons name="wallet-outline" size={20} color="#4CAF50" />
              <Text style={[styles.friendMenuText, { color: '#4CAF50' }]}>Send Credit</Text>
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
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    margin: 20,
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
    paddingHorizontal: 20,
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
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendContextMenu: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    minWidth: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  friendMenuHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  friendMenuAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginVertical: 2,
  },
  lastFriendMenuItem: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 8,
    paddingTop: 15,
  },
  friendMenuText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#333',
    fontWeight: '500',
  },
});
