
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Platform,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  AppState,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks';
import { useRoute, useNavigation } from '@react-navigation/native';
import { API_BASE_URL, SOCKET_URL } from '../utils/apiConfig';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  roomId: string;
  role?: 'user' | 'merchant' | 'mentor' | 'admin' | 'system';
  level?: number;
  type?: 'message' | 'system';
}

export default function PrivateChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [emojiList, setEmojiList] = useState<any[]>([]);
  const [giftList, setGiftList] = useState<any[]>([]);
  const [activeGiftAnimation, setActiveGiftAnimation] = useState<any>(null);
  const giftScaleAnim = useRef(new Animated.Value(0)).current;
  const giftOpacityAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<Message> | null>(null);

  // Get user and token
  const { user, token } = useAuth();

  // Get chat data from navigation params
  const routeParams = (route.params as any) || {};
  const { roomId, roomName, targetUser, targetStatus } = routeParams;

  const messagesRef = useRef<Message[]>([]);
  const userRef = useRef<any>(null);

  // Update refs whenever state changes
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillShowListener?.remove();
      keyboardWillHideListener?.remove();
    };
  }, []);

  // Socket initialization
  useEffect(() => {
    const setupSocketListeners = (socketInstance: Socket) => {
      socketInstance.removeAllListeners('new-message');
      socketInstance.removeAllListeners('receive-private-gift');

      socketInstance.on('new-message', (newMessage: Message) => {
        if (newMessage.roomId === roomId) {
          console.log('Received private message:', newMessage);

          if (typeof newMessage.timestamp === 'string') {
            newMessage.timestamp = new Date(newMessage.timestamp);
          }

          setMessages(prevMessages => {
            const existingIndex = prevMessages.findIndex(msg => 
              msg.id === newMessage.id || 
              (msg.sender === newMessage.sender && msg.content === newMessage.content && msg.id.startsWith('temp_'))
            );

            if (existingIndex !== -1) {
              const updatedMessages = [...prevMessages];
              updatedMessages[existingIndex] = { ...newMessage };
              return updatedMessages;
            } else {
              return [...prevMessages, newMessage];
            }
          });

          // Auto scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      });

      socketInstance.on('receive-private-gift', (data: any) => {
        console.log('Received private gift:', data);

        setActiveGiftAnimation({
          ...data.gift,
          sender: data.from,
          recipient: user?.username,
          timestamp: data.timestamp,
          isPrivate: true
        });

        giftScaleAnim.setValue(0.3);
        giftOpacityAnim.setValue(0);

        Animated.parallel([
          Animated.spring(giftScaleAnim, {
            toValue: 1,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(giftOpacityAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]).start();

        const duration = data.gift.type === 'animated' ? 5000 : 3000;
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(giftScaleAnim, {
              toValue: 1.1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(giftOpacityAnim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setActiveGiftAnimation(null);
          });
        }, duration);
      });
    };

    const initializeSocket = () => {
      if (!token) {
        console.error('No authentication token available');
        return;
      }

      const newSocket = io(SOCKET_URL, {
        transports: ['polling', 'websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10,
        timeout: 30000,
        auth: { token: token }
      });

      newSocket.on('connect', () => {
        console.log('Private chat socket connected');
        setIsSocketConnected(true);
        setupSocketListeners(newSocket);

        // Join private chat room
        if (roomId && user?.username) {
          newSocket.emit('join-room', {
            roomId: roomId,
            username: user.username,
            role: user.role || 'user',
            silent: true
          });
        }
      });

      newSocket.on('disconnect', () => {
        console.log('Private chat socket disconnected');
        setIsSocketConnected(false);
      });

      setSocket(newSocket);
    };

    initializeSocket();

    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [roomId, token]);

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      if (!roomId) return;

      try {
        const response = await fetch(`${API_BASE_URL}/api/chat/private/${roomId}/messages`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const loadedMessages = await response.json();
          console.log('Loaded private chat messages:', loadedMessages.length);

          // Add status message if user has special status
          const statusMessages = [];
          if (targetStatus && targetStatus !== 'online' && targetUser) {
            let statusMessage = '';
            
            if (targetStatus === 'offline') {
              statusMessage = `${targetUser.username} is currently offline`;
            } else if (targetStatus === 'away') {
              statusMessage = `${targetUser.username} is currently away`;
            } else if (targetStatus === 'busy') {
              statusMessage = `${targetUser.username} is currently busy`;
            }

            if (statusMessage) {
              statusMessages.push({
                id: `status_${roomId}_${Date.now()}`,
                sender: 'System',
                content: statusMessage,
                timestamp: new Date(),
                roomId: roomId,
                role: 'system',
                level: 1,
                type: 'system'
              });
            }
          }

          setMessages([...statusMessages, ...loadedMessages]);
        }
      } catch (error) {
        console.error('Error loading private chat messages:', error);
      }
    };

    loadMessages();
  }, [roomId, targetStatus]);

  const handleSendMessage = async () => {
    if (!isSocketConnected || !socket?.connected) {
      Alert.alert('Connection Lost', 'Reconnecting to server... Please try again in a moment.');
      return;
    }

    if (message.trim() && socket && user) {
      const messageContent = message.trim();

      // Check if target user is busy
      if (targetStatus === 'busy') {
        Alert.alert(
          'User is Busy',
          'This user is currently busy and cannot receive messages',
          [{ text: 'OK' }]
        );
        return;
      }

      // Create optimistic message
      const optimisticMessage = {
        id: `temp_${Date.now()}_${user.username}`,
        sender: user.username,
        content: messageContent,
        timestamp: new Date(),
        roomId: roomId,
        role: user.role || 'user',
        level: user.level || 1,
        type: 'message'
      };

      setMessage('');

      // Add message optimistically
      setMessages(prevMessages => [...prevMessages, optimisticMessage]);

      // Auto-scroll
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // Send to server
      socket.emit('sendMessage', {
        roomId: roomId,
        sender: user.username,
        content: messageContent,
        role: user.role || 'user',
        level: user.level || 1,
        type: 'message',
        tempId: optimisticMessage.id
      });
    }
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleVideoCall = async () => {
    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to start a video call');
      return;
    }

    Alert.alert(
      'Start Video Call',
      `Video call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${targetUser?.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Call', 
          onPress: () => {
            if (socket && user) {
              socket.emit('initiate-call', {
                targetUsername: targetUser?.username,
                callType: 'video',
                callerId: user.id,
                callerName: user.username
              });
            }
          }
        }
      ]
    );
  };

  const handleAudioCall = async () => {
    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to start an audio call');
      return;
    }

    Alert.alert(
      'Start Audio Call',
      `Audio call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${targetUser?.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Call', 
          onPress: () => {
            if (socket && user) {
              socket.emit('initiate-call', {
                targetUsername: targetUser?.username,
                callType: 'audio',
                callerId: user.id,
                callerName: user.username
              });
            }
          }
        }
      ]
    );
  };

  const checkUserBalance = async (requiredAmount: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/balance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.balance >= requiredAmount;
      }
      return false;
    } catch (error) {
      console.error('Error checking balance:', error);
      return false;
    }
  };

  const formatTime = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'admin': return '#FF6B35';
      case 'mentor': return '#9C27B0';
      case 'merchant': return '#FF9800';
      case 'user':
      default: return '#2196F3';
    }
  };

  const handleMessageLongPress = (message: Message) => {
    setSelectedMessage(message);
    setShowMessageMenu(true);
  };

  const handleCopyMessage = () => {
    if (selectedMessage) {
      const messageText = `${selectedMessage.sender}: ${selectedMessage.content}`;
      Clipboard.setStringAsync(messageText);
      Alert.alert('Message Copied', 'Message has been copied to clipboard');
      setShowMessageMenu(false);
      setSelectedMessage(null);
    }
  };

  const loadEmojis = async () => {
    // Load emojis logic here - simplified version
    const basicEmojis = [
      { emoji: '😀', type: 'text', name: 'Happy' },
      { emoji: '😂', type: 'text', name: 'Laugh' },
      { emoji: '🥰', type: 'text', name: 'Love' },
      { emoji: '😊', type: 'text', name: 'Smile' },
      { emoji: '😍', type: 'text', name: 'Heart Eyes' },
    ];
    setEmojiList(basicEmojis);
  };

  const handleEmojiSelect = (emoji: any) => {
    setMessage(prev => prev + emoji.emoji);
    setShowEmojiPicker(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    // Handle system messages
    if (item.sender === 'System' || item.role === 'system') {
      return (
        <TouchableOpacity 
          style={styles.systemMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.systemMessageRow}>
            <Text style={styles.systemMessageText}>
              {item.content}
            </Text>
            <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Regular message
    return (
      <TouchableOpacity 
        style={styles.messageContainer}
        onLongPress={() => handleMessageLongPress(item)}
      >
        <View style={styles.messageRow}>
          <View style={styles.messageContentRow}>
            <View style={styles.levelBadgeContainer}>
              <Text style={styles.levelBadgeText}>Lv.{item.level || 1}</Text>
            </View>
            <View style={styles.messageTextContainer}>
              <Text style={styles.messageText}>
                <Text style={[
                  styles.senderName,
                  { color: getRoleColor(item.role) }
                ]}>
                  {item.sender}: 
                </Text>
                <Text style={styles.messageContent}>
                  {item.content}
                </Text>
              </Text>
            </View>
          </View>
          <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#FF9800', '#FF5722']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.privateChatHeaderContent}>
            <View style={styles.privateChatAvatar}>
              {targetUser?.avatar ? (
                <Image source={{ uri: targetUser.avatar }} style={styles.avatarImage} />
              ) : (
                <View style={styles.defaultAvatarContainer}>
                  <Text style={styles.avatarInitial}>
                    {targetUser?.username ? targetUser.username.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.privateChatInfo}>
              <Text style={styles.privateChatName}>
                {targetUser?.username || roomName?.replace('Chat with ', '')}
              </Text>
              <Text style={styles.privateChatStatus}>
                {targetStatus === 'online' ? 'Online' : 
                 targetStatus === 'away' ? 'Away' : 
                 targetStatus === 'busy' ? 'Busy' : 
                 targetStatus === 'offline' ? 'Offline' : 'Online'}
              </Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.headerIcon} onPress={handleVideoCall}>
              <Ionicons name="videocam-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIcon} onPress={handleAudioCall}>
              <Ionicons name="call-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Connection Status */}
        <View style={styles.connectionStatusContainer}>
          <View style={[
            styles.connectionStatusDot,
            !isSocketConnected && styles.disconnectedDot
          ]} />
        </View>
      </LinearGradient>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={true}
      >
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <View style={styles.messagesContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              scrollEnabled={true}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          </View>
        </TouchableWithoutFeedback>

        {/* Input Container */}
        <View
          style={[
            styles.inputContainer,
            isKeyboardVisible && { paddingBottom: Platform.OS === 'android' ? 8 : 8 }
          ]}
        >
          <View style={styles.inputWrapper}>
            <TouchableOpacity 
              style={styles.emojiButton} 
              onPress={() => {
                loadEmojis();
                setShowEmojiPicker(true);
              }}
            >
              <Ionicons name="happy-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.giftButton} onPress={() => setShowGiftPicker(true)}>
              <Ionicons name="gift-outline" size={24} color="#FF69B4" />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message"
              placeholderTextColor="#999"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Ionicons name="send" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={styles.emojiModalOverlay}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPickerContainer}>
            <View style={styles.emojiPickerModal}>
              <View style={styles.emojiPickerHeader}>
                <Text style={styles.emojiPickerTitle}>Select Emoji</Text>
              </View>
              <ScrollView style={styles.emojiScrollContent}>
                <View style={styles.emojiGrid}>
                  {emojiList.map((emoji, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.emojiItem}
                      onPress={() => handleEmojiSelect(emoji)}
                    >
                      <Text style={styles.emojiText}>{emoji.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Message Context Menu */}
      <Modal
        visible={showMessageMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMessageMenu(false)}
        >
          <View style={styles.messageContextMenu}>
            <TouchableOpacity style={styles.messageMenuItem} onPress={handleCopyMessage}>
              <Ionicons name="copy-outline" size={20} color="#333" />
              <Text style={styles.messageMenuText}>Copy Message</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Animation Overlay */}
      {activeGiftAnimation && (
        <View style={styles.giftAnimationOverlay} pointerEvents="box-none">
          <Animated.View 
            style={[
              styles.fullScreenAnimationContainer,
              {
                opacity: giftOpacityAnim,
                transform: [{ scale: giftScaleAnim }]
              }
            ]}
          >
            <View style={styles.smallGiftContainer}>
              <Text style={styles.smallGiftEmoji}>{activeGiftAnimation.icon}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.giftInfoOverlay, { opacity: giftOpacityAnim }]}>
            <Text style={styles.giftSenderName}>{activeGiftAnimation.sender}</Text>
            <Text style={styles.giftDescription}>
              sent {activeGiftAnimation.name} {activeGiftAnimation.icon}
            </Text>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  privateChatHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingVertical: 8,
  },
  privateChatAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  defaultAvatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  privateChatInfo: {
    flex: 1,
  },
  privateChatName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  privateChatStatus: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    padding: 10,
    marginLeft: 2,
  },
  connectionStatusContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  connectionStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  disconnectedDot: {
    backgroundColor: '#F44336',
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  messageContainer: {
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  messageContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  levelBadgeContainer: {
    backgroundColor: '#229c93',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  levelBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  messageTextContainer: {
    flex: 1,
    marginLeft: 6,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '600',
  },
  messageContent: {
    fontSize: 14,
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 6,
    alignSelf: 'flex-start',
  },
  systemMessageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  systemMessageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  systemMessageText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '500',
    flex: 1,
    lineHeight: 20,
    marginRight: 8,
  },
  inputContainer: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    marginHorizontal: 4,
  },
  emojiButton: {
    padding: 10,
    backgroundColor: '#FFA726',
    borderRadius: 20,
    marginRight: 8,
    marginLeft: 4,
  },
  giftButton: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    backgroundColor: '#FF7043',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 4,
    elevation: 2,
    shadowColor: '#FF7043',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  emojiPickerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emojiPickerModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  emojiPickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  emojiPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  emojiScrollContent: {
    maxHeight: 200,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    justifyContent: 'space-around',
  },
  emojiItem: {
    width: 40,
    height: 40,
    margin: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
  },
  emojiText: {
    fontSize: 18,
  },
  messageContextMenu: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    minWidth: 180,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  messageMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageMenuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  // Gift Animation styles
  giftAnimationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 1000,
  },
  fullScreenAnimationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 1001,
  },
  smallGiftContainer: {
    position: 'absolute',
    top: '45%',
    left: '45%',
    width: 60,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 30,
  },
  smallGiftEmoji: {
    fontSize: 24,
    textAlign: 'center',
  },
  giftInfoOverlay: {
    position: 'absolute',
    bottom: 120,
    left: '25%',
    right: '25%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    zIndex: 1002,
  },
  giftSenderName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  giftDescription: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
});
