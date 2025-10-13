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
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  AppState,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { Image } from 'expo-image';
import LottieView from 'lottie-react-native';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks';
import { useRoute, useNavigation } from '@react-navigation/native';
import { API_BASE_URL, SOCKET_URL } from '../utils/apiConfig';
import { GiftVideo } from '../components'; // Import the GiftVideo component

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
  gift?: {
    icon?: string;
    name?: string;
    image?: string | { uri: string };
    price?: number;
  };
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

  // State for gift video
  const [showGiftVideo, setShowGiftVideo] = useState(false);
  const [currentGiftVideoSource, setCurrentGiftVideoSource] = useState<any>(null);

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

  // Load emojis on mount
  useEffect(() => {
    loadEmojis();
  }, []);


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

      // Gift animations are now handled via 'new-message' event with gift data
      // No separate 'receive-private-gift' listener needed to prevent duplicates
    };

    const initializeSocket = () => {
      if (!token) {
        console.error('No authentication token available');
        return;
      }

      const newSocket = io(SOCKET_URL, {
        path: '/socket.io/',
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
        const response = await fetch(`${API_BASE_URL}/chat/private/${roomId}/messages`, {
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
      const optimisticMessage: Message = {
        id: `temp_${Date.now()}_${user.username}`,
        sender: user.username,
        content: messageContent,
        timestamp: new Date(),
        roomId: roomId,
        role: user.role || 'user',
        level: user.level || 1,
        type: 'message' as const
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


  const renderMessageContent = (content: string) => {
    const elements: any[] = [];
    let remaining = content;
    let index = 0;

    // Parse emoticons and mentions
    while (remaining.length > 0) {
      // Check for emoticon pattern <localimg:name> (new format)
      const newEmoticonMatch = remaining.match(/^<localimg:(\w+)>/);
      if (newEmoticonMatch) {
        const emoticonName = newEmoticonMatch[1];
        const emoji = emojiList.find(e => e.name === emoticonName);
        
        if (emoji && emoji.image) {
          elements.push(
            <Image
              key={`emoji-${index}`}
              source={emoji.image}
              style={styles.inlineEmojiIcon}
            />
          );
        } else {
          elements.push(<Text key={`text-${index}`}>:{emoticonName}:</Text>);
        }
        
        remaining = remaining.substring(newEmoticonMatch[0].length);
        index++;
        continue;
      }

      // Check for emoticon pattern :name: (legacy format)
      const legacyEmoticonMatch = remaining.match(/^:([\w]+):/);
      if (legacyEmoticonMatch) {
        const emoticonName = legacyEmoticonMatch[1];
        const emoji = emojiList.find(e => e.name === emoticonName);
        
        if (emoji && emoji.image) {
          elements.push(
            <Image
              key={`emoji-${index}`}
              source={emoji.image}
              style={styles.inlineEmojiIcon}
            />
          );
        } else {
          // If not found, show as text
          elements.push(<Text key={`text-${index}`}>{legacyEmoticonMatch[0]}</Text>);
        }
        
        remaining = remaining.substring(legacyEmoticonMatch[0].length);
        index++;
        continue;
      }

      // Check for @mention
      const mentionMatch = remaining.match(/^(@\w+)/);
      if (mentionMatch) {
        elements.push(
          <Text key={`mention-${index}`} style={styles.mentionText}>
            {mentionMatch[0]}
          </Text>
        );
        remaining = remaining.substring(mentionMatch[0].length);
        index++;
        continue;
      }

      // Regular text - take until next special pattern
      const nextSpecialMatch = remaining.match(/<localimg:\w+>|:\w+:|@\w+/);
      const textContent = nextSpecialMatch 
        ? remaining.substring(0, nextSpecialMatch.index)
        : remaining;
      
      if (textContent) {
        elements.push(<Text key={`text-${index}`}>{textContent}</Text>);
        remaining = remaining.substring(textContent.length);
        index++;
      } else {
        break;
      }
    }

    return elements;
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

  // Helper function to get level badge color (gradient green to blue)
  const getLevelBadgeColor = (level: number) => {
    if (level >= 10) {
      return { bg: '#E3F2FD', text: '#2196F3' }; // Full blue at level 10+
    }
    // Gradient from green to blue (levels 1-9)
    const ratio = (level - 1) / 9; // 0 at level 1, 1 at level 9
    const redValue = Math.round(76 + ratio * (-43)); // 76 to 33
    const greenValue = Math.round(175 + ratio * 68); // 175 to 243
    const blueValue = Math.round(80 + ratio * 27); // 80 to 107
    
    const textColor = `rgb(${redValue}, ${greenValue}, ${blueValue})`;
    const bgColor = level <= 3 ? '#F0FFF4' : level <= 6 ? '#E8F5E9' : '#E1F5FE';
    
    return { bg: bgColor, text: textColor };
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
    try {
      // Load emojis from local assets/emoticon folder
      const localEmojis = [
        { name: 'angryold', image: require('../../assets/emoticon/angryold.png') },
        { name: 'annoyedold', image: require('../../assets/emoticon/annoyedold.png') },
        { name: 'bum', image: require('../../assets/emoticon/bum.png') },
        { name: 'callme', image: require('../../assets/emoticon/callme.png') },
        { name: 'cheekyold', image: require('../../assets/emoticon/cheekyold.png') },
        { name: 'confused', image: require('../../assets/emoticon/confused.png') },
        { name: 'coolold', image: require('../../assets/emoticon/coolold.png') },
        { name: 'cry', image: require('../../assets/emoticon/cry.png') },
        { name: 'curiousold', image: require('../../assets/emoticon/curiousold.png') },
        { name: 'dies', image: require('../../assets/emoticon/dies.png') },
        { name: 'disgustold', image: require('../../assets/emoticon/disgustold.png') },
        { name: 'dizzy', image: require('../../assets/emoticon/dizzy.png') },
        { name: 'drooling', image: require('../../assets/emoticon/drooling.png') },
        { name: 'err', image: require('../../assets/emoticon/err.png') },
        { name: 'flirt', image: require('../../assets/emoticon/flirt.png') },
        { name: 'happy', image: require('../../assets/emoticon/happy.png') },
        { name: 'hugme', image: require('../../assets/emoticon/hugme.png') },
        { name: 'hugme2', image: require('../../assets/emoticon/hugme2.png') },
        { name: 'hypnotized', image: require('../../assets/emoticon/hypnotized.png') },
        { name: 'insane', image: require('../../assets/emoticon/insane.png') },
        { name: 'kissback', image: require('../../assets/emoticon/kissback.png') },
        { name: 'kisslips', image: require('../../assets/emoticon/kisslips.png') },
        { name: 'kissme', image: require('../../assets/emoticon/kissme.png') },
        { name: 'kissold', image: require('../../assets/emoticon/kissold.png') },
        { name: 'love', image: require('../../assets/emoticon/love.png') },
        { name: 'nerd', image: require('../../assets/emoticon/nerd.png') },
        { name: 'sad', image: require('../../assets/emoticon/sad.png') },
        { name: 'shocked', image: require('../../assets/emoticon/shocked.png') },
        { name: 'shy', image: require('../../assets/emoticon/shy.png') },
        { name: 'shyold', image: require('../../assets/emoticon/shyold.png') },
        { name: 'silent', image: require('../../assets/emoticon/silent.png') },
        { name: 'sleeping', image: require('../../assets/emoticon/sleeping.png') },
        { name: 'sleepy', image: require('../../assets/emoticon/sleepy.png') },
        { name: 'speechless', image: require('../../assets/emoticon/speechless.png') },
        { name: 'sssh', image: require('../../assets/emoticon/sssh.png') },
        { name: 'unimpressed', image: require('../../assets/emoticon/unimpressed.png') },
        { name: 'veryhappy', image: require('../../assets/emoticon/veryhappy.png') },
        { name: 'wink', image: require('../../assets/emoticon/wink.png') },
        { name: 'yuck', image: require('../../assets/emoticon/yuck.png') },
        { name: 'yum', image: require('../../assets/emoticon/yum.png') },
      ];
      setEmojiList(localEmojis);
    } catch (error) {
      console.error('Error loading emojis:', error);
      setEmojiList([]);
    }
  };


  const loadGifts = async () => {
    try {
      console.log('Loading gifts from server API...');
      const response = await fetch(`${API_BASE_URL}/gifts`, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const serverGifts = await response.json();
        console.log('Gifts loaded from server:', serverGifts.length);
        
        const gifts = serverGifts.map((gift: any) => {
          const mappedGift: any = {
            id: gift.id.toString(),
            name: gift.name,
            icon: gift.icon,
            price: gift.price,
            type: gift.type || 'static',
            category: gift.category || 'popular'
          };

          if (gift.image) {
            if (gift.image.startsWith('https://')) {
              mappedGift.image = { uri: gift.image };
            } else {
              mappedGift.imageUrl = gift.image;
            }
          }

          if (gift.animation) {
            if (gift.animation.startsWith('https://')) {
              mappedGift.videoSource = { uri: gift.animation };
            } else {
              mappedGift.videoUrl = gift.animation;
            }
          }

          return mappedGift;
        });

        setGiftList(gifts);
        console.log('✅ Server gifts loaded:', gifts.length);
      } else {
        console.error('Failed to load gifts from API, using fallback');
        const fallbackGifts = [
          { id: '1', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'emoji', category: 'popular' },
          { id: '2', name: 'Ionceng', icon: '🔔', price: 300, type: 'emoji', category: 'popular' },
          { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'emoji', category: 'lucky' },
        ];
        setGiftList(fallbackGifts);
      }
    } catch (error) {
      console.error('Error loading gifts:', error);
      const fallbackGifts = [
        { id: '1', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'emoji', category: 'popular' },
        { id: '2', name: 'Ionceng', icon: '🔔', price: 300, type: 'emoji', category: 'popular' },
        { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'emoji', category: 'lucky' },
      ];
      setGiftList(fallbackGifts);
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    // Use emoji name wrapped in colons for image emojis, or the emoji text for text emojis
    const emojiText = emoji.name ? `:${emoji.name}:` : emoji.emoji;
    setMessage(prev => prev + emojiText + ' ');
    setShowEmojiPicker(false);
  };

  const handleGiftSelect = async (gift: any) => {
    try {
      // Check balance first
      const balanceResponse = await fetch(`${API_BASE_URL}/gifts/check-balance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          giftPrice: gift.price
        }),
      });

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (!balanceData.canAfford) {
          Alert.alert('Insufficient Balance', `You need ${gift.price} coins to send this gift. Current balance: ${balanceData.currentBalance} coins`);
          setShowGiftPicker(false);
          return;
        }
      }

      // Proceed with gift purchase for private chat
      const response = await fetch(`${API_BASE_URL}/gift/purchase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          giftId: gift.id,
          giftPrice: gift.price,
          recipientUsername: targetUser?.username,
          roomId: roomId,
          isPrivate: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Private gift sent successfully:', result);

        // Process gift locally first to show immediate animation
        console.log('🎁 Processing gift locally for immediate display:', gift);
        
        // Prepare gift data for animation
        const giftAnimationData = {
          ...gift,
          sender: user?.username,
          recipient: targetUser?.username,
          timestamp: new Date().toISOString(),
          isPrivate: true
        };

        // Handle different gift types for immediate display
        if (gift.type === 'animated_video' && gift.videoSource) {
          console.log('🎬 Processing MP4 video gift locally:', gift.name);
          setCurrentGiftVideoSource(gift.videoSource);
          setActiveGiftAnimation({
            ...giftAnimationData,
            type: 'animated_video'
          });
          setShowGiftVideo(true);
          
        } else if (gift.image || gift.imageUrl || gift.videoUrl) {
          console.log('🖼️ Processing image gift locally:', gift.name);
          
          const imageSource = gift.image || { uri: gift.imageUrl || gift.videoUrl };
          
          setCurrentGiftVideoSource(imageSource);
          setActiveGiftAnimation({
            ...giftAnimationData,
            type: 'png'
          });
          setShowGiftVideo(true);
          
        } else {
          console.log('🎭 Processing icon/static gift locally:', gift.name);
          
          setActiveGiftAnimation(giftAnimationData);

          // Reset animations
          giftScaleAnim.setValue(0.3);
          giftOpacityAnim.setValue(0);

          // Start animation
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

          // Auto-close timing based on gift type
          const duration = 6000; // All gifts disappear after 6 seconds
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
              console.log('🎁 Local gift animation ended');
              setActiveGiftAnimation(null);
            });
          }, duration);
        }

        // Send gift message via socket for other users
        if (socket && user) {
          console.log('🎁 Sending private gift via socket to other users:', {
            gift: gift,
            to: targetUser?.username,
            from: user.username,
            roomId: roomId
          });
          
          socket.emit('send-private-gift', {
            giftId: gift.id,
            gift: gift,
            to: targetUser?.username,
            from: user.username,
            roomId: roomId,
            timestamp: new Date().toISOString()
          });
          
          console.log('🎁 Private gift socket event sent');
        } else {
          console.error('❌ Socket or user not available for sending private gift');
        }

        // Close modal immediately without blocking alert
        setShowGiftPicker(false);
      } else {
        const errorData = await response.json();
        setShowGiftPicker(false); // Close modal on error
        Alert.alert('Error', errorData.error || 'Failed to send gift');
      }
    } catch (error) {
      console.error('Error sending private gift:', error);
      setShowGiftPicker(false); // Close modal on error
      Alert.alert('Error', 'Failed to send gift. Please try again.');
    }
  };


  const renderMessage = ({ item }: { item: Message }) => {
    // Handle system messages (including gift notifications)
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
            {/* Display gift image if available */}
            {item.gift && item.gift.image && (
              <Image
                source={typeof item.gift.image === 'string' ? { uri: item.gift.image } : item.gift.image}
                style={styles.giftMessageImage}
                contentFit="contain"
              />
            )}
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
            <View style={[styles.levelBadgeContainer, { backgroundColor: getLevelBadgeColor(item.level || 1).bg }]}>
              <Text style={[styles.levelBadgeText, { color: getLevelBadgeColor(item.level || 1).text }]}>Lv.{item.level || 1}</Text>
            </View>
            <View style={styles.messageTextContainer}>
              <Text style={styles.messageText}>
                <Text style={[
                  styles.senderName,
                  { color: item.sender === 'chatme_bot' ? '#167027' : getRoleColor(item.role) }
                ]}>
                  {item.sender}:
                </Text>
                <Text style={[
                  styles.messageContent,
                  { color: item.sender === 'chatme_bot' ? '#0f23bd' : '#333' }
                ]}>
                  {renderMessageContent(item.content)}
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
            {/* Debug test gift button - Remove in production */}
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => {
                console.log('🧪 Testing gift animation manually');
                const testGift = {
                  id: 'test_gift',
                  name: 'Test Heart',
                  icon: '❤️',
                  type: 'static',
                  price: 100
                };
                setActiveGiftAnimation({
                  ...testGift,
                  sender: 'TestUser',
                  recipient: user?.username,
                  timestamp: new Date().toISOString(),
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
                }, 6000); // Test gift: 6 seconds duration
              }}
            >
              <Ionicons name="heart" size={24} color="#FF69B4" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={() => setShowMessageMenu(true)}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
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
            <TouchableOpacity
              style={styles.giftButton}
              onPress={() => {
                loadGifts();
                setShowGiftPicker(true);
              }}
            >
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
                      {emoji.image ? (
                        <Image source={emoji.image} style={styles.emojiImage} />
                      ) : (
                        <Text style={styles.emojiText}>{emoji.emoji}</Text>
                      )}
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
            {selectedMessage ? (
              // Message-specific menu when a message is selected
              <TouchableOpacity style={styles.messageMenuItem} onPress={handleCopyMessage}>
                <Ionicons name="copy-outline" size={20} color="#333" />
                <Text style={styles.messageMenuText}>Copy Message</Text>
              </TouchableOpacity>
            ) : (
              // General private chat menu when ellipsis is pressed
              <>
                <TouchableOpacity
                  style={styles.messageMenuItem}
                  onPress={() => {
                    setShowMessageMenu(false);
                    navigation.navigate('Profile', { userId: targetUser?.username });
                  }}
                >
                  <Ionicons name="person-outline" size={20} color="#333" />
                  <Text style={styles.messageMenuText}>View Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.messageMenuItem}
                  onPress={() => {
                    setShowMessageMenu(false);
                    Alert.alert(
                      'Clear Chat History',
                      'Are you sure you want to clear this chat history? This action cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clear',
                          style: 'destructive',
                          onPress: () => {
                            setMessages([]);
                            Alert.alert('Success', 'Chat history cleared');
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF6B35" />
                  <Text style={[styles.messageMenuText, { color: '#FF6B35' }]}>Clear Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.messageMenuItem, styles.lastMenuItem]}
                  onPress={() => {
                    setShowMessageMenu(false);
                    navigation.goBack();
                  }}
                >
                  <Ionicons name="exit-outline" size={20} color="#F44336" />
                  <Text style={[styles.messageMenuText, { color: '#F44336' }]}>Close Chat</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Picker Modal */}
      <Modal
        visible={showGiftPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGiftPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGiftPicker(false)}
        >
          <View style={styles.giftPickerModal}>
              <View style={styles.giftPickerHeader}>
                <Text style={styles.giftPickerTitle}>Send Gift</Text>
                <TouchableOpacity
                  style={styles.giftCloseButton}
                  onPress={() => setShowGiftPicker(false)}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <FlatList
                data={giftList}
                renderItem={({ item: gift, index }) => (
                  <View style={styles.newGiftItemContainer}>
                    <TouchableOpacity
                      style={styles.newGiftItem}
                      onPress={() => handleGiftSelect(gift)}
                    >
                      <View style={styles.newGiftIconContainer}>
                        {gift.image || gift.imageUrl ? (
                          <Image 
                            source={gift.image || { uri: gift.imageUrl }} 
                            style={styles.giftImage} 
                            contentFit="contain"
                            cachePolicy="memory-disk"
                          />
                        ) : gift.animation || gift.videoUrl ? (
                          (() => {
                            const animSource = gift.animation || { uri: gift.videoUrl };
                            const animStr = gift.animation?.uri || gift.videoUrl || (typeof gift.animation === 'string' ? gift.animation : '');
                            
                            const isLottie = gift.mediaType === 'lottie' || (
                              animStr && 
                              (animStr.toLowerCase().includes('.json') || 
                               animStr.toLowerCase().includes('lottie'))
                            );
                            
                            const isVideo = gift.mediaType === 'video' || (
                              animStr && 
                              (animStr.toLowerCase().includes('.mp4') || 
                               animStr.toLowerCase().includes('.webm') || 
                               animStr.toLowerCase().includes('.mov'))
                            );
                            
                            if (isLottie) {
                              return (
                                <LottieView
                                  source={animSource}
                                  autoPlay
                                  loop
                                  style={styles.giftImage}
                                />
                              );
                            } else if (isVideo) {
                              return (
                                <Video
                                  source={animSource}
                                  style={styles.giftImage}
                                  resizeMode={'contain' as any}
                                  shouldPlay={false}
                                  isLooping={false}
                                  isMuted={true}
                                />
                              );
                            } else {
                              return (
                                <Image 
                                  source={animSource} 
                                  style={styles.giftImage} 
                                  contentFit="contain"
                                  cachePolicy="memory-disk"
                                />
                              );
                            }
                          })()
                        ) : (
                          <Text style={styles.newGiftIcon}>{gift.icon}</Text>
                        )}
                        {gift.type === 'animated' && (
                          <View style={styles.animatedBadge}>
                            <Text style={styles.animatedBadgeText}>✨</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.newGiftName} numberOfLines={1}>{gift.name}</Text>
                      <View style={styles.giftPriceContainer}>
                        <Ionicons name="diamond-outline" size={12} color="#FFC107" />
                        <Text style={styles.newGiftPrice}>{gift.price}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
                numColumns={3}
                keyExtractor={(gift, index) => `${gift.id}-${index}`}
                contentContainerStyle={styles.giftGridContainer}
                showsVerticalScrollIndicator={false}
              />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Animation Overlay */}
      {activeGiftAnimation && (
        <View style={styles.giftAnimationOverlay} pointerEvents="box-none">
          {/* Video/PNG/Lottie Gift Component */}
          {((activeGiftAnimation.type === 'png' || activeGiftAnimation.type === 'animated_video' || activeGiftAnimation.type === 'json' || activeGiftAnimation.type === 'lottie') && showGiftVideo && currentGiftVideoSource) ? (
            <GiftVideo
              visible={true}
              source={currentGiftVideoSource}
              type={
                activeGiftAnimation.type === 'animated_video' ? 'video' : 
                (activeGiftAnimation.type === 'json' || activeGiftAnimation.type === 'lottie') ? 'json' : 
                'png'
              }
              giftData={activeGiftAnimation}
              fullScreen={activeGiftAnimation.type === 'animated_video' || activeGiftAnimation.type === 'json' || activeGiftAnimation.type === 'lottie'}
              onEnd={() => {
                console.log('🎁 Gift animation ended');
                setShowGiftVideo(false);
                setCurrentGiftVideoSource(null);
                setActiveGiftAnimation(null);
              }}
            />
          ) : (
            /* Static/Icon Gift Animation - ONLY SHOW GIFT IMAGE */
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
                <Text style={styles.smallGiftEmoji}>
                  {activeGiftAnimation.icon || '🎁'}
                </Text>
              </View>
            </Animated.View>
          )}
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
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 1,
  },
  privateChatStatus: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
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
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
    alignSelf: 'flex-start',
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
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
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  systemMessageText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '500',
    flex: 1,
    lineHeight: 20,
    marginRight: 8,
  },
  giftMessageImage: {
    width: 60,
    height: 60,
    marginLeft: 8,
    marginRight: 8,
    borderRadius: 8,
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
  emojiImage: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
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
  lastMenuItem: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 8,
    paddingTop: 15,
  },
  // Gift Picker styles
  giftPickerModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    height: '50%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  giftPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  giftPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  giftCloseButton: {
    padding: 4,
  },
  giftScrollContent: {
    maxHeight: 300,
  },
  giftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    justifyContent: 'space-between',
  },
  giftItem: {
    width: '31%',
    height: 110,
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  giftImage: {
    width: 50,
    height: 50,
    marginBottom: 4,
  },
  giftEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  giftName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  giftPrice: {
    fontSize: 9,
    color: '#FF6B35',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // New FlatList Gift Picker Styles
  newGiftItemContainer: {
    flex: 1,
    maxWidth: '33.33%',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  newGiftItem: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(224, 224, 224, 0.5)',
    position: 'relative',
  },
  newGiftIconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  newGiftIcon: {
    fontSize: 40,
  },
  newGiftName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    textAlign: 'center',
  },
  newGiftPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFC107',
  },
  giftPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftGridContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  animatedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedBadgeText: {
    fontSize: 12,
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
    justifyContent: 'center',
    alignItems: 'center',
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
  smallGiftImage: {
    width: 60,
    height: 60,
  },
  mentionText: {
    color: '#9C27B0',
    fontWeight: 'bold',
  },
  inlineEmojiIcon: {
    width: 24,
    height: 24,
    marginHorizontal: 2,
  },
});