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
import { GiftVideo } from '../components'; // Import the GiftVideo component
import IncomingCallModal from '../components/IncomingCallModal';
import SimpleCallModal from '../components/SimpleCallModal';

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

  // State for gift video
  const [showGiftVideo, setShowGiftVideo] = useState(false);
  const [currentGiftVideoSource, setCurrentGiftVideoSource] = useState<any>(null);

  // Call functionality states
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'video' | 'audio' | null>(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [callCost, setCallCost] = useState(0);
  const [totalDeducted, setTotalDeducted] = useState(0);
  const callIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);
  const [callRinging, setCallRinging] = useState(false);

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
        console.log('🎁 Received private gift:', data);
        console.log('🎁 Gift data:', JSON.stringify(data.gift, null, 2));
        console.log('🎁 From:', data.from, 'Timestamp:', data.timestamp);

        // Enrich gift with local assets based on ID (ensure string conversion)
        const localAssets = getGiftAssets(String(data.gift.id));
        const enrichedGift = { ...data.gift, ...localAssets };

        // Always set active gift animation first
        const giftAnimationData = {
          ...enrichedGift,
          sender: data.from,
          recipient: user?.username,
          timestamp: data.timestamp,
          isPrivate: true
        };

        // Handle MP4 video gifts
        if (enrichedGift.type === 'animated_video' && enrichedGift.videoSource) {
          console.log('🎬 Processing MP4 video gift:', enrichedGift.name);
          
          setCurrentGiftVideoSource(enrichedGift.videoSource);
          setActiveGiftAnimation({
            ...giftAnimationData,
            type: 'animated_video'
          });
          setShowGiftVideo(true);
          
        } else if (enrichedGift.type === 'animated_gif' || enrichedGift.type === 'static') {
          console.log('🖼️ Processing image/GIF gift:', enrichedGift.name, 'Type:', enrichedGift.type);
          
          // Handle static images and animated GIFs with local assets
          setCurrentGiftVideoSource(enrichedGift.image);
          setActiveGiftAnimation({
            ...giftAnimationData,
            type: enrichedGift.type
          });
          setShowGiftVideo(true);
          
        } else if (enrichedGift.image) {
          console.log('🖼️ Processing fallback image gift:', enrichedGift.name);
          
          // Handle any remaining image gifts with local assets
          setCurrentGiftVideoSource(enrichedGift.image);
          setActiveGiftAnimation({
            ...giftAnimationData,
            type: enrichedGift.type || 'static'
          });
          setShowGiftVideo(true);
          
        } else {
          console.log('🎭 Processing icon/static gift:', data.gift.name);
          
          // Handle other gift types (icons, etc.)
          setActiveGiftAnimation(giftAnimationData);

          // Reset animations with requestAnimationFrame to avoid UseInsertionEffect warning
          requestAnimationFrame(() => {
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
                console.log('🎁 Static gift animation ended');
                setActiveGiftAnimation(null);
              });
            }, duration);
          });
        }
      });

      // Listen for incoming calls
      socketInstance.on('incoming-call', (callData) => {
        console.log('Received incoming call:', callData);
        setIncomingCallData(callData);
        setShowIncomingCallModal(true);
      });

      // Listen for call responses
      socketInstance.on('call-response-received', (responseData) => {
        console.log('Call response received:', responseData);
        setCallRinging(false);

        if (responseData.response === 'accept') {
          Alert.alert(
            'Call Accepted',
            `${responseData.responderName} accepted your call`,
            [
              {
                text: 'Start Call',
                onPress: () => {
                  setShowCallModal(true);
                  startCallTimer(incomingCallData?.callType || 'video');
                }
              }
            ]
          );
        } else {
          Alert.alert(
            'Call Declined',
            `${responseData.responderName} declined your call`
          );
        }
      });

      // Listen for call initiated confirmation
      socketInstance.on('call-initiated', (confirmData) => {
        console.log('Call initiated:', confirmData);
        Alert.alert(
          'Calling...',
          `Calling ${confirmData.targetUsername}...`,
          [
            {
              text: 'Cancel Call',
              style: 'cancel',
              onPress: () => {
                setCallRinging(false);
                socketInstance.emit('end-call', {
                  targetUsername: confirmData.targetUsername,
                  endedBy: user?.username
                });
              }
            }
          ]
        );
      });

      // Listen for call errors
      socketInstance.on('call-error', (errorData) => {
        console.log('Call error:', errorData);
        setCallRinging(false);
        Alert.alert('Call Error', errorData.error);
      });

      // Listen for call ended
      socketInstance.on('call-ended', (endData) => {
        console.log('Call ended:', endData);
        setCallRinging(false);
        setShowIncomingCallModal(false);
        endCall();
        Alert.alert('Call Ended', `Call ended by ${endData.endedBy}`);
      });
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

  const handleVideoCall = async () => {
    if (!targetUser?.username) {
      Alert.alert('Error', 'No target user for call');
      return;
    }

    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to start a video call');
      return;
    }

    Alert.alert(
      'Start Video Call',
      `Video call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${targetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Call',
          onPress: () => {
            if (socket && user) {
              setCallRinging(true);
              socket.emit('initiate-call', {
                targetUsername: targetUser.username,
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
    if (!targetUser?.username) {
      Alert.alert('Error', 'No target user for call');
      return;
    }

    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to start an audio call');
      return;
    }

    Alert.alert(
      'Start Audio Call',
      `Audio call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${targetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Call',
          onPress: () => {
            if (socket && user) {
              setCallRinging(true);
              socket.emit('initiate-call', {
                targetUsername: targetUser.username,
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
      const response = await fetch(`${API_BASE_URL}/user/balance`, {
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

  const deductCoins = async (amount: number, type: string, description: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/user/deduct-coins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          type: `${type}_call`,
          description: `${type} call for ${description}`,
          recipientUsername: targetUser?.username
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error deducting coins:', error);
      return false;
    }
  };

  const startCallTimer = (type: 'video' | 'audio') => {
    setIsInCall(true);
    setCallType(type);
    setCallTimer(0);
    setCallCost(0);
    setTotalDeducted(0);

    callIntervalRef.current = setInterval(() => {
      setCallTimer(prev => {
        const newTime = prev + 1;
        const elapsedMinutes = Math.ceil(newTime / 60);

        // Calculate display cost based on elapsed minutes
        let displayCost = 0;
        if (elapsedMinutes >= 1) {
          displayCost = 2500; // First minute
          if (elapsedMinutes > 1) {
            displayCost += (elapsedMinutes - 1) * 2000; // Additional minutes
          }
        }
        setCallCost(displayCost);

        // Deduct coins every 20 seconds with proper rate distribution
        if (newTime % 20 === 0 && newTime > 0) {
          const currentMinute = Math.ceil(newTime / 60);
          const intervalInMinute = Math.floor(((newTime - 1) % 60) / 20) + 1;

          let intervalCost;
          if (currentMinute === 1) {
            intervalCost = intervalInMinute === 1 ? 834 : 833;
          } else {
            intervalCost = intervalInMinute === 3 ? 666 : 667;
          }

          setTotalDeducted(prev => prev + intervalCost);
          deductCoins(intervalCost, type, `${(newTime/60).toFixed(2)} minutes`);
        }

        return newTime;
      });
    }, 1000);
  };

  const endCall = () => {
    if (callIntervalRef.current) {
      clearInterval(callIntervalRef.current);
      callIntervalRef.current = null;
    }

    const finalEarnings = Math.floor(totalDeducted * 0.7);
    if (finalEarnings > 0) {
      Alert.alert(
        'Call Ended',
        `Total earnings: ${finalEarnings} coins (70% of ${totalDeducted} coins spent)`,
        [{ text: 'OK' }]
      );
    }

    setIsInCall(false);
    setCallType(null);
    setCallTimer(0);
    setCallCost(0);
    setTotalDeducted(0);
    setShowCallModal(false);
  };

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAcceptCall = async () => {
    if (!incomingCallData) return;

    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to accept this call');
      handleDeclineCall();
      return;
    }

    if (socket && user) {
      socket.emit('call-response', {
        callerId: incomingCallData.callerId,
        response: 'accept',
        responderName: user.username
      });
    }

    setShowIncomingCallModal(false);
    setShowCallModal(true);
    startCallTimer(incomingCallData.callType);
  };

  const handleDeclineCall = () => {
    if (!incomingCallData) return;

    if (socket && user) {
      socket.emit('call-response', {
        callerId: incomingCallData.callerId,
        response: 'decline',
        responderName: user.username
      });
    }

    setShowIncomingCallModal(false);
    setIncomingCallData(null);
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

  // Gift registry to map server gift IDs to local assets
  const getGiftAssets = (giftId: string) => {
    const giftAssetMap: { [key: string]: any } = {
      '1': { type: 'animated_video', videoSource: require('../../assets/gift/animated/Love.mp4') },
      '2': { type: 'animated_video', videoSource: require('../../assets/gift/animated/Ufonew.mp4') },
      '3': { type: 'animated_gif', image: require('../../assets/gift/animated/Lion.gif') },
      '4': { type: 'static', image: require('../../assets/gift/image/duyung.png') },
      '5': { type: 'static', image: require('../../assets/gift/image/duyung_moph.png') },
      '6': { type: 'static', image: require('../../assets/gift/image/girl.png') },
      '7': { type: 'animated_gif', image: require('../../assets/gift/image/lion_img.gif') },
      '8': { type: 'static', image: require('../../assets/gift/image/lumba.png') },
      '9': { type: 'static', image: require('../../assets/gift/image/putri_duyung.png') },
      '10': { type: 'emoji' },
      '11': { type: 'emoji' },
      '12': { type: 'emoji' },
      '13': { type: 'animated_video', videoSource: require('../../assets/gift/animated/BabyLion.mp4') },
      '14': { type: 'animated_video', videoSource: require('../../assets/gift/animated/bookmagical.mp4') },
      '15': { type: 'animated_video', videoSource: require('../../assets/gift/animated/Grildcar.mp4') },
      '16': { type: 'animated_video', videoSource: require('../../assets/gift/animated/luxurycar.mp4') },
      '17': { type: 'static', image: require('../../assets/gift/image/Baby Lion.png') },
      '18': { type: 'static', image: require('../../assets/gift/image/Birds Love.png') },
      '19': { type: 'static', image: require('../../assets/gift/image/Couple.png') },
      '20': { type: 'static', image: require('../../assets/gift/image/Flower Girls.png') },
      '21': { type: 'animated_gif', image: require('../../assets/gift/image/Happy Jump.gif') },
      '22': { type: 'static', image: require('../../assets/gift/image/Hug.png') },
      '23': { type: 'static', image: require('../../assets/gift/image/I Loveyou .png') },
      '24': { type: 'static', image: require('../../assets/gift/image/Kids Hug.png') },
      '25': { type: 'static', image: require('../../assets/gift/image/Kiss.png') },
      '26': { type: 'static', image: require('../../assets/gift/image/Love Panda.png') },
      '27': { type: 'static', image: require('../../assets/gift/image/Panda.png') }
    };
    return giftAssetMap[giftId] || {};
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
        
        // Map server gifts and add local asset references
        const gifts = serverGifts.map((gift: any) => {
          const mappedGift: any = {
            id: gift.id.toString(),
            name: gift.name,
            icon: gift.icon,
            price: gift.price,
            type: gift.type || 'static',
            category: gift.category || 'popular'
          };

          // Add local asset references for better performance
          if (gift.image) {
            try {
              // Map known image paths to require statements
              const imageMap: { [key: string]: any } = {
                '/assets/gift/image/putri_duyung.png': require('../../assets/gift/image/putri_duyung.png'),
                '/assets/gift/image/girl.png': require('../../assets/gift/image/girl.png'),
                '/assets/gift/image/lion_img.gif': require('../../assets/gift/image/lion_img.gif'),
                '/assets/gift/image/lumba.png': require('../../assets/gift/image/lumba.png'),
                '/assets/gift/image/Baby Lion.png': require('../../assets/gift/image/Baby Lion.png'),
                '/assets/gift/image/Birds Love.png': require('../../assets/gift/image/Birds Love.png'),
                '/assets/gift/image/Couple.png': require('../../assets/gift/image/Couple.png'),
                '/assets/gift/image/Flower Girls.png': require('../../assets/gift/image/Flower Girls.png'),
                '/assets/gift/image/Happy Jump.gif': require('../../assets/gift/image/Happy Jump.gif'),
                '/assets/gift/image/Hug.png': require('../../assets/gift/image/Hug.png'),
                '/assets/gift/image/I Loveyou .png': require('../../assets/gift/image/I Loveyou .png'),
                '/assets/gift/image/Kids Hug.png': require('../../assets/gift/image/Kids Hug.png'),
                '/assets/gift/image/Kiss.png': require('../../assets/gift/image/Kiss.png'),
                '/assets/gift/image/Love Panda.png': require('../../assets/gift/image/Love Panda.png'),
                '/assets/gift/image/Panda.png': require('../../assets/gift/image/Panda.png')
              };
              
              if (imageMap[gift.image]) {
                mappedGift.image = imageMap[gift.image];
              }
            } catch (error) {
              console.log('Image asset not found for:', gift.image);
            }
          }

          if (gift.animation) {
            try {
              // Map known video paths to require statements
              const videoMap: { [key: string]: any } = {
                '/assets/gift/animated/Love.mp4': require('../../assets/gift/animated/Love.mp4'),
                '/assets/gift/animated/Ufonew.mp4': require('../../assets/gift/animated/Ufonew.mp4'),
                '/assets/gift/animated/BabyLion.mp4': require('../../assets/gift/animated/BabyLion.mp4'),
                '/assets/gift/animated/bookmagical.mp4': require('../../assets/gift/animated/bookmagical.mp4'),
                '/assets/gift/animated/Grildcar.mp4': require('../../assets/gift/animated/Grildcar.mp4'),
                '/assets/gift/animated/luxurycar.mp4': require('../../assets/gift/animated/luxurycar.mp4')
              };
              
              if (videoMap[gift.animation]) {
                mappedGift.videoSource = videoMap[gift.animation];
              }
            } catch (error) {
              console.log('Video asset not found for:', gift.animation);
            }
          }

          return mappedGift;
        });

        setGiftList(gifts);
        console.log('✅ Server gifts loaded:', gifts.length);
      } else {
        console.error('Failed to load gifts from API, using fallback');
        // Simple fallback gifts if API fails
        const fallbackGifts = [
          { id: '1', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'emoji', category: 'popular' },
          { id: '2', name: 'Ionceng', icon: '🔔', price: 300, type: 'emoji', category: 'popular' },
          { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'emoji', category: 'lucky' },
        ];
        setGiftList(fallbackGifts);
      }
    } catch (error) {
      console.error('Error loading gifts:', error);
      // Simple fallback gifts on error
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
          
        } else if (gift.image || (gift.animation && gift.animation.includes('.png'))) {
          console.log('🖼️ Processing PNG gift locally:', gift.name);
          
          const imageSource = gift.image 
            ? (typeof gift.image === 'string' ? { uri: gift.image } : gift.image)
            : (typeof gift.animation === 'string' ? { uri: gift.animation } : gift.animation);
          
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
          const duration = gift.type === 'animated' ? 5000 : 3000;
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

        // Show success message
        Alert.alert('Gift Sent!', `You sent ${gift.name} ${gift.icon} to ${targetUser?.username}`);
        setShowGiftPicker(false);
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to send gift');
      }
    } catch (error) {
      console.error('Error sending private gift:', error);
      Alert.alert('Error', 'Failed to send gift. Please try again.');
    }
  };

  // Helper function to get level icon based on user level
  const getLevelIcon = (level: number) => {
    const iconLevel = Math.min(Math.max(1, Math.floor(level)), 9); // Clamp between 1-9
    const iconMap: { [key: number]: any } = {
      1: require('../../assets/icon/lvl_1.png'),
      2: require('../../assets/icon/lvl_2.png'),
      3: require('../../assets/icon/lvl_3.png'),
      4: require('../../assets/icon/lvl_4.png'),
      5: require('../../assets/icon/lvl_5.png'),
      6: require('../../assets/icon/lvl_6.png'),
      7: require('../../assets/icon/lvl_7.png'),
      8: require('../../assets/icon/lvl_8.png'),
      9: require('../../assets/icon/lvl_9.png'),
    };
    return iconMap[iconLevel] || iconMap[1];
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
            <Image 
              source={getLevelIcon(item.level || 1)} 
              style={styles.levelBadgeIcon}
              resizeMode="contain"
            />
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
            <TouchableOpacity style={styles.headerIcon} onPress={handleVideoCall}>
              <Ionicons name="videocam-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIcon} onPress={handleAudioCall}>
              <Ionicons name="call-outline" size={24} color="#fff" />
            </TouchableOpacity>
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
                }, 3000);
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
                    Alert.alert('Search Messages', 'Search functionality will be added soon');
                  }}
                >
                  <Ionicons name="search-outline" size={20} color="#333" />
                  <Text style={styles.messageMenuText}>Search Messages</Text>
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
          <View style={styles.giftPickerContainer}>
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
              <ScrollView style={styles.giftScrollContent}>
                <View style={styles.giftGrid}>
                  {giftList.map((gift, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.giftItem}
                      onPress={() => handleGiftSelect(gift)}
                    >
                      <Text style={styles.giftEmoji}>{gift.icon}</Text>
                      <Text style={styles.giftName}>{gift.name}</Text>
                      <Text style={styles.giftPrice}>{gift.price} coins</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Animation Overlay */}
      {activeGiftAnimation && (
        <View style={styles.giftAnimationOverlay} pointerEvents="box-none">
          {/* Video/PNG Gift Component */}
          {((activeGiftAnimation.type === 'png' || activeGiftAnimation.type === 'animated_video') && showGiftVideo && currentGiftVideoSource) ? (
            <GiftVideo
              visible={true}
              source={currentGiftVideoSource}
              type={activeGiftAnimation.type === 'animated_video' ? 'video' : 'png'}
              giftData={activeGiftAnimation}
              fullScreen={activeGiftAnimation.type === 'animated_video'}
              onEnd={() => {
                console.log('🎁 Video/PNG gift animation ended');
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

      {/* Incoming Call Modal */}
      <IncomingCallModal
        visible={showIncomingCallModal}
        callerName={incomingCallData?.callerName || 'Unknown'}
        callerAvatar={undefined}
        callType={incomingCallData?.callType || 'video'}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />

      {/* Active Call Modal */}
      <SimpleCallModal
        visible={showCallModal}
        callType={callType || 'video'}
        targetUser={targetUser}
        callTimer={callTimer}
        callCost={callCost}
        totalDeducted={totalDeducted}
        onEndCall={() => {
          endCall();
          if (socket && targetUser) {
            socket.emit('end-call', {
              targetUsername: targetUser.username,
              endedBy: user?.username
            });
          }
        }}
      />
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
  levelBadgeIcon: {
    width: 20,
    height: 20,
    marginRight: 6,
    alignSelf: 'flex-start',
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
  giftPickerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  giftPickerModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxHeight: 400,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
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
    padding: 12,
    justifyContent: 'space-around',
  },
  giftItem: {
    width: 90,
    height: 100,
    margin: 6,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  giftEmoji: {
    fontSize: 24,
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
  // Call Modal Styles
  callModalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  callHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  callHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  callTargetName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  callTimer: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 5,
  },
  callCost: {
    fontSize: 14,
    color: '#FFD700',
  },
  videoCallContainer: {
    flex: 1,
  },
  callControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  callButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 15,
  },
  endCallButton: {
    backgroundColor: '#F44336',
  },
  // Incoming Call Modal Styles
  incomingCallOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomingCallModal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginHorizontal: 20,
    minWidth: 300,
  },
  incomingCallHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  incomingCallTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  incomingCallSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  callerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  callerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  callerAvatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  callRateInfo: {
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  callRateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  callRateDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  incomingCallButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  callActionButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
  },
  declineButton: {
    backgroundColor: '#F44336',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  callActionText: {
    fontSize: 12,
    color: 'white',
    fontWeight: 'bold',
    marginTop: 5,
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