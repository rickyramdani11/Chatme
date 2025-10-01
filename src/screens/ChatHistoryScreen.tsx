
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';

interface ChatHistoryItem {
  id: string;
  name: string;
  type: 'private' | 'room' | 'support';
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  targetUser?: {
    id: string;
    username: string;
    role: string;
    level: number;
    avatar?: string;
  };
  isOnline?: boolean;
}

export default function ChatHistoryScreen() {
  const navigation = useNavigation();
  const { user, token } = useAuth();
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChatHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/chat/history`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChatHistory(data);
      } else {
        console.error('Failed to fetch chat history');
        setChatHistory([]);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
      setChatHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChatHistory();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatHistory();
    setRefreshing(false);
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit' 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit' 
      });
    }
  };

  const getRandomAvatarColor = (name: string) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', 
      '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471'
    ];
    const firstChar = name?.charAt(0).toUpperCase() || 'A';
    const index = firstChar.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const handleChatPress = (chat: ChatHistoryItem) => {
    if (chat.type === 'private') {
      // Ensure we have proper targetUser data for private chat
      const targetUser = chat.targetUser || {
        id: chat.id.replace('private_', '').split('_')[1] || 'unknown',
        username: chat.name.replace('Chat with ', '') || 'Unknown User',
        role: 'user',
        level: 1,
        avatar: null
      };

      (navigation as any).navigate('PrivateChat', {
        roomId: chat.id,
        roomName: chat.name,
        roomDescription: `Private chat with ${targetUser.username}`,
        type: 'private',
        targetUser: targetUser,
        targetStatus: 'online', // Default status
        autoFocusTab: true
      });
    } else if (chat.type === 'support') {
      (navigation as any).navigate('Chat', {
        roomId: chat.id,
        roomName: chat.name,
        roomDescription: 'Support Chat',
        type: 'support',
        isSupport: true,
        autoFocusTab: true
      });
    } else {
      (navigation as any).navigate('Chat', {
        roomId: chat.id,
        roomName: chat.name,
        roomDescription: chat.name + ' room',
        type: 'room',
        autoFocusTab: true
      });
    }
  };

  const renderChatItem = ({ item }: { item: ChatHistoryItem }) => {
    const isOfficial = item.name.toLowerCase().includes('official') || item.name.toLowerCase().includes('system');
    const avatarUri = item.targetUser?.avatar;
    
    // Check if avatar is a valid URL or server path
    const isValidAvatar = avatarUri && (
      avatarUri.startsWith('http') ||
      avatarUri.startsWith('https') ||
      avatarUri.startsWith('/api/users/avatar/') ||
      avatarUri.startsWith(`${API_BASE_URL}/users/avatar/`)
    );

    let avatarDisplay;
    if (isValidAvatar) {
      // Construct proper URL if it's a server path
      let fullAvatarUrl = avatarUri;
      if (avatarUri.startsWith('/api/users/avatar/')) {
        fullAvatarUrl = `${BASE_URL}${avatarUri}`;
      }

      avatarDisplay = (
        <Image
          source={{ uri: fullAvatarUrl }}
          style={styles.avatar}
          onError={(error) => {
            console.log('Failed to load avatar:', fullAvatarUrl, error.nativeEvent?.error);
          }}
        />
      );
    } else {
      // Show default avatar with first letter or icon
      if (isOfficial) {
        avatarDisplay = (
          <View style={[styles.avatar, { backgroundColor: '#007AFF' }]}>
            <Ionicons name="notifications" size={24} color="#fff" />
          </View>
        );
      } else {
        avatarDisplay = (
          <View style={[styles.avatar, { backgroundColor: getRandomAvatarColor(item.name) }]}>
            <Text style={styles.avatarText}>
              {item.name?.charAt(0).toUpperCase() || 'C'}
            </Text>
          </View>
        );
      }
    }

    return (
      <TouchableOpacity 
        style={styles.chatItem} 
        onPress={() => handleChatPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {avatarDisplay}
          {item.isOnline && item.type === 'private' && (
            <View style={styles.onlineIndicator} />
          )}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <View style={styles.nameContainer}>
              <Text style={styles.chatName} numberOfLines={1}>
                {item.name}
              </Text>
              {isOfficial && (
                <Ionicons name="checkmark-circle" size={16} color="#FF6B35" style={styles.verifiedIcon} />
              )}
            </View>
            <View style={styles.timeContainer}>
              <Text style={styles.chatTime}>
                {formatDate(item.lastMessageTime)}
              </Text>
              {item.unreadCount > 0 && (
                <View style={styles.redCircleIndicator} />
              )}
            </View>
          </View>

          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || 'No messages yet'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#8B5CF6', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Chat History</Text>
          
          <TouchableOpacity style={styles.refreshButton} onPress={fetchChatHistory}>
            <Ionicons name="refresh" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Chat List */}
      <View style={styles.content}>
        {loading && chatHistory.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading chat history...</Text>
          </View>
        ) : chatHistory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={60} color="#ccc" />
            <Text style={styles.emptyTitle}>No Chat History</Text>
            <Text style={styles.emptySubtitle}>
              Start a conversation to see it here
            </Text>
          </View>
        ) : (
          <FlatList
            data={chatHistory}
            renderItem={renderChatItem}
            keyExtractor={(item) => item.id}
            style={styles.chatList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  refreshButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redCircleIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
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
});
