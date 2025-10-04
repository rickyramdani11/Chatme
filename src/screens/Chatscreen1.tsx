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
  ImageBackground,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  AppState, // Added AppState for background reconnection
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks';
import { useRoute, useNavigation } from '@react-navigation/native';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '../utils/backgroundTasks';
import { API_BASE_URL, SOCKET_URL } from '../utils/apiConfig';
import Daily, { DailyMediaView } from '@daily-co/react-native-daily-js';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  roomId: string;
  role?: 'user' | 'merchant' | 'mentor' | 'admin' | 'system';
  level?: number;
  type?: 'join' | 'leave' | 'message' | 'command' | 'me' | 'room_info' | 'report' | 'ban' | 'kick' | 'lock' | 'support' | 'gift' | 'error' | 'system';
  commandType?: 'system' | 'bot';
  userRole?: 'user' | 'merchant' | 'mentor' | 'admin';
  image?: string;
  isSupport?: boolean;
}

interface ChatTab {
  id: string;
  title: string;
  type: 'room' | 'private' | 'support';
  messages: Message[];
  managedBy?: string;
  description?: string;
  moderators?: string[];
  isSupport?: boolean;
}


export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState(0);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([]);
  const [showPopupMenu, setShowPopupMenu] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiList, setEmojiList] = useState<any[]>([]); // Changed to any[] to hold diverse emoji data
  const [selectedImageEmojis, setSelectedImageEmojis] = useState<any[]>([]); // Queue for image emojis to send with message
  const [showParticipantMenu, setShowParticipantMenu] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [bannedUsers, setBannedUsers] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isUserScrolling, setIsUserScrolling] = useState(false); // Track if user is manually scrolling
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [selectedGift, setSelectedGift] = useState<any>(null);
  const [giftList, setGiftList] = useState<any[]>([]);
  const [activeGiftTab, setActiveGiftTab] = useState<'all' | 'special'>('all');
  const [sendToAllUsers, setSendToAllUsers] = useState(false);
  const [isSendingGift, setIsSendingGift] = useState(false);
  const isSendingGiftRef = useRef(false);
  const [activeGiftAnimation, setActiveGiftAnimation] = useState<any>(null);
  const [giftAnimationDuration, setGiftAnimationDuration] = useState(5000); // Default 5 seconds
  const giftScaleAnim = useRef(new Animated.Value(0)).current;
  const giftOpacityAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null); // Ref for the main ScrollView containing tabs
  const flatListRefs = useRef<Record<string, FlatList<Message> | null>>({}); // Refs for each FlatList in tabs
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true); // State for auto-scroll toggle
  
  // Create refs for state values that socket listeners need to avoid stale closures
  const chatTabsRef = useRef<ChatTab[]>([]);
  const activeTabRef = useRef<number>(0);
  const autoScrollEnabledRef = useRef<boolean>(true);
  const isUserScrollingRef = useRef<boolean>(false);
  const userRef = useRef<any>(null); // Initialize with null, will be set in useEffect
  const giftVideoRef = useRef<Video>(null);
  const [showUserTagMenu, setShowUserTagMenu] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [filteredParticipants, setFilteredParticipants] = useState<any[]>([]);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  // Get user and token before any refs that depend on them
  const { user, token } = useAuth();
  
  // Get room data from navigation params  
  const routeParams = (route.params as any) || {};
  const { roomId, roomName, roomDescription, autoFocusTab, type = 'room', targetUser, isSupport } = routeParams;
  
  // Update refs whenever state changes to avoid stale closures
  useEffect(() => {
    chatTabsRef.current = chatTabs;
  }, [chatTabs]);
  
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  useEffect(() => {
    autoScrollEnabledRef.current = autoScrollEnabled;
  }, [autoScrollEnabled]);
  
  useEffect(() => {
    isUserScrollingRef.current = isUserScrolling;
  }, [isUserScrolling]);
  
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  
  // Add AppState listener for proper background/foreground handling
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('AppState changed to:', nextAppState);

      if (nextAppState === 'active') {
        console.log('App became active - ensuring socket connection and rejoining rooms');
        
        // Reset scroll state
        setIsUserScrolling(false);
        
        if (socket) {
          // Always rejoin rooms using latest state from refs
          setTimeout(() => {
            const currentTabs = chatTabsRef.current;
            const currentUser = userRef.current;
            if (currentTabs.length > 0 && currentUser?.username) {
              console.log(`Rejoining ${currentTabs.length} rooms after app resume`);
              currentTabs.forEach((tab, index) => {
                setTimeout(() => {
                  console.log('Rejoining room after app resume:', tab.id, currentUser.username);
                  if (tab.isSupport) {
                    socket.emit('join-support-room', {
                      supportRoomId: tab.id,
                      isAdmin: currentUser.role === 'admin'
                    });
                  } else {
                    socket.emit('join-room', {
                      roomId: tab.id,
                      username: currentUser.username,
                      role: currentUser.role || 'user'
                    });
                  }
                }, index * 100); // Stagger rejoining
              });
            }
          }, 500);
        }
        
        // Force scroll to bottom for current tab
        setTimeout(() => {
          const currentTab = chatTabsRef.current[activeTabRef.current];
          if (currentTab && flatListRefs.current[currentTab.id]) {
            flatListRefs.current[currentTab.id]?.scrollToEnd({ animated: true });
          }
        }, 1000);
        
      } else if (nextAppState === 'background') {
        console.log('App moved to background - maintaining socket connection');
        // Keep socket alive for better message delivery
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      appStateSubscription?.remove();
    };
  }, [socket]); // Dependency on socket to re-setup when socket changes
  
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(roomId || null);
  const [showUserGiftPicker, setShowUserGiftPicker] = useState(false);
  const [selectedGiftForUser, setSelectedGiftForUser] = useState<any>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'video' | 'audio' | null>(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [callCost, setCallCost] = useState(0);
  const [totalDeducted, setTotalDeducted] = useState(0);
  const callIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);
  const [callRinging, setCallRinging] = useState(false);

  // Helper functions for role checking
  const isRoomOwner = () => {
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    return currentRoom && currentRoom.managedBy === user?.username;
  };

  const isRoomModerator = () => {
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    return currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
  };

  // Call handling functions
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

  const deductCoins = async (amount: number, type: string, description: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/deduct-coins`, {
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
          const intervalInMinute = Math.floor(((newTime - 1) % 60) / 20) + 1; // Which 20s interval in current minute (1, 2, or 3)

          let intervalCost;
          if (currentMinute === 1) {
            // First minute: distribute 2500 as [834, 833, 833]
            intervalCost = intervalInMinute === 1 ? 834 : 833;
          } else {
            // After first minute: distribute 2000 as [667, 667, 666]
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

    // Show earnings for call recipient based on actual total deducted (no partial interval charge)
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

  const handleVideoCall = async () => {
    // Get targetUser from navigation params or selected participant
    const callTargetUser = targetUser || selectedParticipant;
    
    if (!callTargetUser || !callTargetUser.username) {
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
      `Video call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${callTargetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Call', 
          onPress: () => {
            // Send call notification to target user
            if (socket && user) {
              setCallRinging(true);
              socket.emit('initiate-call', {
                targetUsername: callTargetUser.username,
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
    // Get targetUser from navigation params or selected participant
    const callTargetUser = targetUser || selectedParticipant;
    
    if (!callTargetUser || !callTargetUser.username) {
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
      `Audio call rates:\n• First minute: 2,500 coins\n• After 1st minute: 2,000 coins/minute\n\nStart call with ${callTargetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Call', 
          onPress: () => {
            // Send call notification to target user
            if (socket && user) {
              setCallRinging(true);
              socket.emit('initiate-call', {
                targetUsername: callTargetUser.username,
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

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAcceptCall = async () => {
    if (!incomingCallData) return;

    // Check balance before accepting call
    const hasBalance = await checkUserBalance(2500);
    if (!hasBalance) {
      Alert.alert('Insufficient Balance', 'You need at least 2,500 coins to accept this call');
      handleDeclineCall();
      return;
    }

    // Send accept response
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

    // Send decline response
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

  // Function to join a specific room (called when navigating from RoomScreen)
  const joinSpecificRoom = async (roomId: string, roomName: string) => {
    try {
      console.log('Joining specific room/chat:', roomId, roomName, type || 'room', 'User:', user?.username);

      // Check if room already exists in tabs
      const existingTabIndex = chatTabs.findIndex(tab => tab.id === roomId);
      if (existingTabIndex !== -1) {
        // Room already exists, just switch to it
        setActiveTab(existingTabIndex);
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            x: existingTabIndex * width,
            animated: true
          });
        }
        return;
      }

      // For private chats, don't try to load messages from room API
      let messages = [];
      if (type !== 'private' && !isSupport) { // Also exclude support chats from room message loading
        // Load messages for the specific room
        try {
          const messagesResponse = await fetch(`${API_BASE_URL}/api/messages/${roomId}`, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ChatMe-Mobile-App',
            },
          });
          messages = messagesResponse.ok ? await messagesResponse.json() : [];
        } catch (error) {
          console.log('No previous messages for room');
          messages = [];
        }
      } else if (type === 'private') {
        // For private chats, try to load private chat messages
        try {
          const messagesResponse = await fetch(`${API_BASE_URL}/api/chat/private/${roomId}/messages`, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ChatMe-Mobile-App',
            },
          });
          messages = messagesResponse.ok ? await messagesResponse.json() : [];
        } catch (error) {
          console.log('No previous messages for private chat');
          messages = [];
        }
      } else if (isSupport) {
        // Load messages for support chat
        try {
          const messagesResponse = await fetch(`${API_BASE_URL}/api/support/${roomId}/messages`, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'ChatMe-Mobile-App',
            },
          });
          messages = messagesResponse.ok ? await messagesResponse.json() : [];
        } catch (error) {
          console.log('No previous messages for support chat');
          messages = [];
        }
      }

      // Get room data to get correct managedBy info
        let roomData = null;
        if (type !== 'private' && !isSupport) {
          try {
            const roomResponse = await fetch(`${API_BASE_URL}/api/rooms`, {
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChatMe-Mobile-App',
              },
            });
            if (roomResponse.ok) {
              const rooms = await roomResponse.json();
              roomData = rooms.find((r: any) => r.id.toString() === roomId.toString());
            }
          } catch (error) {
            console.log('Could not fetch room data');
          }
        } else if (isSupport) {
          // For support rooms, we don't have roomData in the same way
          roomData = {
            managedBy: 'Support Team',
            createdBy: 'System',
            moderators: []
          };
        }

        // Create room info messages for room types (not private chats or support chats)
        let roomInfoMessages = [];
        if (type !== 'private' && !isSupport) {
          const currentTime = new Date();

          // Room description message
          roomInfoMessages.push({
            id: `room_info_desc_${roomId}`,
            sender: roomName,
            content: roomDescription || `Welcome to ${roomName} official chatroom`,
            timestamp: new Date(currentTime.getTime() - 3000), // 3 seconds earlier
            roomId: roomId,
            role: 'system',
            level: 1,
            type: 'room_info'
          });

          // Managed by message  
          roomInfoMessages.push({
            id: `room_info_managed_${roomId}`,
            sender: roomName,
            content: `This room is managed by ${roomData?.managed_by || roomData?.created_by || 'admin'}`,
            timestamp: new Date(currentTime.getTime() - 2000), // 2 seconds earlier
            roomId: roomId,
            role: 'system',
            level: 1,
            type: 'room_info'
          });

          // Currently in the room message (will be updated with actual participants)
          roomInfoMessages.push({
            id: `room_info_current_${roomId}`,
            sender: roomName,
            content: `Currently in the room: Loading participants...`,
            timestamp: new Date(currentTime.getTime() - 1000), // 1 second earlier
            roomId: roomId,
            role: 'system',
            level: 1,
            type: 'room_info'
          });
        }

        // Combine room info messages with existing messages
        const allMessages = [...roomInfoMessages, ...messages];

        // Create new tab for the room or private chat or support chat
        const newTab: ChatTab = {
          id: roomId,
          title: roomName,
          type: isSupport ? 'support' : (type || 'room'),
          messages: allMessages,
          managedBy: type === 'private' ? targetUser?.username : (roomData?.managed_by || roomData?.created_by || 'admin'),
          description: roomDescription || (type === 'private' ? `Private chat with ${targetUser?.username}` : isSupport ? 'Support Chat' : `${roomName} room`),
          moderators: roomData?.moderators || [],
          isSupport: isSupport
        };

      // Add the new tab and set it as active
      setChatTabs(prevTabs => {
        const newTabs = [...prevTabs, newTab];
        // Set the new room as active tab
        const newActiveTab = newTabs.length - 1;
        setActiveTab(newActiveTab);

        // Scroll to the active tab after state update
        setTimeout(() => {
          if (scrollViewRef.current) {
            scrollViewRef.current.scrollTo({
              x: newActiveTab * width,
              animated: true
            });
          }
        }, 100);

        return newTabs;
      });

      // Participant is automatically added by socket gateway on join-room event
      // No need to manually call addParticipantToRoom here

      // Join room via socket (for both room and private chat)
      if (socket) {
        if (isSupport) {
          // Join support room with admin status
          socket.emit('join-support-room', {
            supportRoomId: roomId,
            isAdmin: user?.role === 'admin'
          });
        } else {
          // Join regular room or private chat
          socket.emit('join-room', {
            roomId: roomId,
            username: user?.username || 'Guest',
            role: user?.role || 'user'
          });
        }
      }

    } catch (error) {
      console.error('Error joining specific room:', error);
    }
  };

  // Initialize socket with persistent connection and auto-reconnect
  useEffect(() => {
    const setupSocketListeners = (socketInstance) => {
      // Clear existing listeners to prevent duplicates
      socketInstance.removeAllListeners('new-message');
      socketInstance.removeAllListeners('user-joined');
      socketInstance.removeAllListeners('user-left');
      socketInstance.removeAllListeners('participants-updated');
      socketInstance.removeAllListeners('user-kicked');
      socketInstance.removeAllListeners('user-muted');
      socketInstance.removeAllListeners('receiveGift');
      socketInstance.removeAllListeners('receive-private-gift');
      socketInstance.removeAllListeners('gift-animation');
      socketInstance.removeAllListeners('admin-joined'); // Listener for admin joined support chat
      socketInstance.removeAllListeners('support-message'); // Listener for support messages

      socketInstance.on('new-message', (newMessage: Message) => {
        console.log('Received new message:', {
          sender: newMessage.sender,
          content: newMessage.content,
          type: newMessage.type,
          role: newMessage.role,
          roomId: newMessage.roomId
        });

        // Ensure timestamp is a proper Date object
        if (typeof newMessage.timestamp === 'string') {
          newMessage.timestamp = new Date(newMessage.timestamp);
        }

        setChatTabs(prevTabs => {
          const updatedTabs = prevTabs.map(tab => {
            if (tab.id === newMessage.roomId) {
              // Replace optimistic message if it exists, otherwise add new message
              const existingIndex = tab.messages.findIndex(msg => 
                msg.id === newMessage.id || 
                (msg.sender === newMessage.sender && msg.content === newMessage.content && msg.id.startsWith('temp_'))
              );

              let updatedMessages;
              if (existingIndex !== -1) {
                // Replace optimistic message with real message
                updatedMessages = [...tab.messages];
                updatedMessages[existingIndex] = { ...newMessage };
                console.log('Replaced optimistic message with real message');
              } else {
                // Always add system messages without duplicate check (they're from server and should be shown)
                if (newMessage.sender === 'System') {
                  updatedMessages = [...tab.messages, newMessage];
                  console.log('System message added to tab:', tab.id, 'Content:', newMessage.content.substring(0, 50));
                } else {
                  // For user messages, be more lenient with duplicate checking to prevent message loss
                  const isDuplicate = tab.messages.some(msg => 
                    msg.id === newMessage.id || 
                    (msg.sender === newMessage.sender && 
                     msg.content === newMessage.content &&
                     Math.abs(new Date(msg.timestamp).getTime() - new Date(newMessage.timestamp).getTime()) < 1000)
                  );

                  if (!isDuplicate) {
                    updatedMessages = [...tab.messages, newMessage];
                    console.log('User message added to tab:', tab.id, 'Total messages:', updatedMessages.length);
                  } else {
                    console.log('Duplicate user message filtered out');
                    return tab; // Don't update if duplicate
                  }
                }
              }

              // Auto-scroll for ALL messages if autoscroll is enabled and user is not manually scrolling
              // Use refs to avoid stale closure issues
              if (autoScrollEnabledRef.current && !isUserScrollingRef.current) {
                setTimeout(() => {
                  console.log('Auto-scrolling to end for room:', tab.id);
                  flatListRefs.current[tab.id]?.scrollToEnd({ animated: true });
                }, 100);
              }

              return { ...tab, messages: updatedMessages };
            }
            return tab;
          });

          // Force re-render to ensure messages are visible
          console.log('Updated chatTabs with new message, total tabs:', updatedTabs.length);
          return updatedTabs;
        });

        // Track unread messages for other tabs using refs to avoid stale closures
        const currentRoomId = chatTabsRef.current[activeTabRef.current]?.id;
        if (newMessage.roomId !== currentRoomId && newMessage.sender !== userRef.current?.username) {
          setUnreadCounts(prev => ({
            ...prev,
            [newMessage.roomId]: (prev[newMessage.roomId] || 0) + 1
          }));
        }
        
        // Force scroll to bottom for current room messages with better timing using refs
        if (newMessage.roomId === chatTabsRef.current[activeTabRef.current]?.id) {
          setTimeout(() => {
            console.log('Forcing scroll for current room message:', newMessage.roomId);
            if (flatListRefs.current[newMessage.roomId]) {
              flatListRefs.current[newMessage.roomId]?.scrollToEnd({ animated: true });
            }
          }, 150);
        }
      });

      socketInstance.on('user-joined', (joinMessage: Message) => {
        setChatTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === joinMessage.roomId
              ? { ...tab, messages: [...tab.messages, joinMessage] }
              : tab
          )
        );
      });

      socketInstance.on('user-left', (leaveMessage: Message) => {
        setChatTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === leaveMessage.roomId
              ? { ...tab, messages: [...tab.messages, leaveMessage] }
              : tab
          )
        );
      });

      // Listen for participant updates using refs to avoid stale closures
      socketInstance.on('participants-updated', (updatedParticipants: any[]) => {
        console.log('Participants updated:', updatedParticipants.length);
        setParticipants(updatedParticipants);

        // Update the "Currently in the room" message with new participants using refs
        const currentTabs = chatTabsRef.current;
        const currentActiveTab = activeTabRef.current;
        if (currentTabs[currentActiveTab] && currentTabs[currentActiveTab].type !== 'private' && updatedParticipants.length > 0) {
          const currentRoomId = currentTabs[currentActiveTab].id;
          const participantNames = updatedParticipants.map(p => p.username).join(', ');
          const updatedContent = `Currently in the room: ${participantNames}`;

          setChatTabs(prevTabs =>
            prevTabs.map(tab => {
              if (tab.id === currentRoomId) {
                const updatedMessages = tab.messages.map(msg => {
                  if (msg.id === `room_info_current_${currentRoomId}`) {
                    return { ...msg, content: updatedContent };
                  }
                  return msg;
                });
                return { ...tab, messages: updatedMessages };
              }
              return tab;
            })
          );
        }
      });

      // Listen for user kicked events
      socketInstance.on('user-kicked', (data: any) => {
        if (data.kickedUser === user?.username) {
          Alert.alert('You have been kicked', `You were kicked from ${data.roomName} by ${data.kickedBy}`);
          // Remove the room tab
          setChatTabs(prevTabs => prevTabs.filter(tab => tab.id !== data.roomId));
        } else {
          // Update participant list
          setParticipants(prev => prev.filter(p => p.username !== data.kickedUser));
        }
      });

      // Listen for user muted events
      socketInstance.on('user-muted', (data: any) => {
        if (data.mutedUser === user?.username) {
          if (data.action === 'mute') {
            setMutedUsers(prev => [...prev, data.mutedUser]);
            Alert.alert('You have been muted', `You were muted by ${data.mutedBy}`);
          } else {
            setMutedUsers(prev => prev.filter(username => username !== data.mutedUser));
            Alert.alert('You have been unmuted', `You were unmuted by ${data.mutedBy}`);
          }
        }
      });

      // Listen for user banned events
      socketInstance.on('user-banned', (data: any) => {
        if (data.bannedUser === user?.username) {
          if (data.action === 'ban') {
            setBannedUsers(prev => [...prev, data.bannedUser]);
            Alert.alert('You have been banned', `You were banned from ${data.roomName} by ${data.bannedBy}`);
            // Remove the room tab for banned user
            setChatTabs(prevTabs => prevTabs.filter(tab => tab.id !== data.roomId));
          } else {
            setBannedUsers(prev => prev.filter(username => username !== data.bannedUser));
            Alert.alert('You have been unbanned', `You were unbanned from ${data.roomName} by ${data.bannedBy}`);
          }
        } else {
          // Update participant list for other users
          if (data.action === 'ban') {
            setParticipants(prev => prev.filter(p => p.username !== data.bannedUser));
          }
        }
      });

      // Listen for gift broadcasts from server
      socketInstance.on('receiveGift', (data: any) => {
        console.log('Received gift broadcast:', data);

        // Show animation for all users (including sender for consistency)
        setActiveGiftAnimation({
          ...data.gift,
          sender: data.sender,
          timestamp: data.timestamp,
        });

        // Start dramatic entrance animation for full-screen effect
        giftScaleAnim.setValue(0.3);
        giftOpacityAnim.setValue(0);

        // Create a dramatic zoom-in effect like live streaming apps
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

        // Auto-close timing based on gift type (same logic as private gifts)
        const isVideoGift = data.gift.animation && (
          (typeof data.gift.animation === 'string' && data.gift.animation.toLowerCase().includes('.mp4')) ||
          (data.gift.name && (data.gift.name.toLowerCase().includes('love') || data.gift.name.toLowerCase().includes('ufo')))
        );

        // For non-video gifts, use fixed timeout
        if (!isVideoGift) {
          const duration = data.gift.type === 'animated' ? 5000 : 3000;
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(giftScaleAnim, {
                toValue: 1.1, // Slight zoom out effect
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
        }
        // For video gifts, auto-close is handled by video completion callback

        // Add gift message to chat
        const giftMessage: Message = {
          id: `gift_${Date.now()}_${data.sender}`,
          sender: data.sender,
          content: `🎁 sent a ${data.gift.name} ${data.gift.icon}`,
          timestamp: new Date(data.timestamp),
          roomId: chatTabs[activeTab]?.id || data.roomId,
          role: data.role || 'user',
          level: data.level || 1,
          type: 'gift'
        };

        setChatTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === (chatTabs[activeTab]?.id || data.roomId)
              ? { ...tab, messages: [...tab.messages, giftMessage] }
              : tab
          )
        );
      });

      // Listen for private gift notifications
      socketInstance.on('receive-private-gift', (data: any) => {
        console.log('Received private gift:', data);

        // Show animation for recipient
        setActiveGiftAnimation({
          ...data.gift,
          sender: data.from,
          recipient: user?.username,
          timestamp: data.timestamp,
          isPrivate: true
        });

        // Start dramatic entrance animation
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

        // Auto-close timing based on gift type
        const isVideoGift = data.gift.animation && (
          (typeof data.gift.animation === 'string' && data.gift.animation.toLowerCase().includes('.mp4')) ||
          (data.gift.name && (data.gift.name.toLowerCase().includes('love') || data.gift.name.toLowerCase().includes('ufo')))
        );

        // For non-video gifts, use fixed timeout
        if (!isVideoGift) {
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
        }
        // For video gifts, auto-close is handled by video completion callback
      });

      // Listen for gift animations (legacy support)
      socketInstance.on('gift-animation', (data: any) => {
        console.log('Received legacy gift animation:', data);
        // Redirect to receiveGift handler for consistency
        socketInstance.emit('receiveGift', data);
      });

      // Listen for admin joined support chat
      socketInstance.on('admin-joined', (data) => {
        console.log('Admin joined support chat:', data);
        const adminMessage: Message = {
          id: `admin_join_${Date.now()}`,
          sender: 'System',
          content: data.message,
          timestamp: new Date(),
          roomId: currentRoomId, // Use currentRoomId for context
          role: 'system',
          level: 1,
          type: 'join' // Use 'join' type for system messages about users joining
        };

        // Find the correct tab and add the message
        setChatTabs(prevTabs =>
          prevTabs.map(tab => 
            tab.id === currentRoomId // Ensure we add to the correct support chat tab
              ? { ...tab, messages: [...tab.messages, adminMessage] }
              : tab
          )
        );
      });

      // Listen for support messages
      socketInstance.on('support-message', (supportMessage: Message) => {
        console.log('Received support message:', supportMessage);

        // Ensure timestamp is a proper Date object
        if (typeof supportMessage.timestamp === 'string') {
          supportMessage.timestamp = new Date(supportMessage.timestamp);
        }

        // Add the support message to the correct tab
        setChatTabs(prevTabs =>
          prevTabs.map(tab => {
            if (tab.id === supportMessage.roomId && tab.isSupport) {
              const updatedMessages = [...tab.messages, supportMessage];

              // Auto-scroll if enabled and user is scrolling
              if (autoScrollEnabled && !isUserScrolling) {
                setTimeout(() => {
                  flatListRefs.current[tab.id]?.scrollToEnd({ animated: true });
                }, 30);
              }

              return { ...tab, messages: updatedMessages };
            }
            return tab;
          })
        );

        // Update unread counts for support chats if not active
        const currentTab = chatTabs[activeTab];
        if (currentTab && currentTab.id !== supportMessage.roomId && currentTab.isSupport) {
          setUnreadCounts(prev => ({
            ...prev,
            [supportMessage.roomId]: (prev[supportMessage.roomId] || 0) + 1
          }));
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
        setShowCallModal(false);
        setShowIncomingCallModal(false);
        endCall();
        Alert.alert('Call Ended', `Call ended by ${endData.endedBy}`);
      });
    };

    const initializeSocket = () => {
      console.log('Initializing socket connection...');
      console.log('Gateway URL:', SOCKET_URL); // Use SOCKET_URL which points to the gateway

      if (!token) {
        console.error('No authentication token available');
        return;
      }

      // Initialize socket connection to gateway with better stability options
      const newSocket = io(SOCKET_URL, { // Use SOCKET_URL
        transports: ['polling', 'websocket'], // Start with polling first for better Replit compatibility
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10, // Increased attempts for better persistence
        timeout: 30000, // Increased timeout for better connection stability
        forceNew: false,
        upgrade: true,
        rememberUpgrade: false, // Don't remember upgrade for better compatibility
        closeOnBeforeunload: false, // Keep connection alive during app state changes
        auth: {
          token: token
        }
      });

      // Connection events
      newSocket.on('connect', () => {
        console.log('Socket connected successfully to gateway');
        console.log('Socket ID:', newSocket.id);
        setIsSocketConnected(true);
        setReconnectAttempts(0);

        // Setup all socket listeners after connection
        setupSocketListeners(newSocket);

        // Rejoin all active rooms after reconnection using refs to avoid stale closures
        setTimeout(() => {
          const currentTabs = chatTabsRef.current;
          const currentUser = userRef.current;
          if (currentTabs.length > 0 && currentUser?.username) {
            console.log(`Rejoining ${currentTabs.length} rooms after reconnection`);
            currentTabs.forEach((tab, index) => {
              // Stagger room rejoining to prevent server overload
              setTimeout(() => {
                console.log('Rejoining room after reconnect:', tab.id, currentUser.username);
                if (tab.isSupport) {
                  newSocket.emit('join-support-room', {
                    supportRoomId: tab.id,
                    isAdmin: currentUser.role === 'admin'
                  });
                } else {
                  newSocket.emit('join-room', {
                    roomId: tab.id,
                    username: currentUser.username,
                    role: currentUser.role || 'user'
                  });
                }
              }, index * 100); // 100ms delay between each room join
            });
          }
        }, 200); // Initial delay to ensure connection is stable
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected from gateway:', reason);
        setIsSocketConnected(false);

        // Don't attempt reconnection for intentional disconnects
        if (reason === 'io client disconnect' || reason === 'io server disconnect') {
          console.log('Intentional disconnect, not attempting reconnection');
          return;
        }

        // For transport close and other unexpected disconnects, attempt reconnection
        console.log('Unexpected disconnect, attempting reconnection...');
        attemptReconnection();
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        console.error('Gateway URL:', SOCKET_URL);
        setIsSocketConnected(false);

        // Don't attempt reconnection if it's a network issue
        if (error.message && error.message.includes('websocket error')) {
          console.log('WebSocket specific error detected, will retry with polling');
        }

        attemptReconnection();
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`Socket reconnected to gateway after ${attemptNumber} attempts`);
        setIsSocketConnected(true);
        setReconnectAttempts(0);
      });

      newSocket.on('reconnect_failed', () => {
        console.log('Socket reconnection failed');
        setIsSocketConnected(false);
        // Try manual reconnection after a delay
        setTimeout(() => {
          if (reconnectAttempts < maxReconnectAttempts) {
            attemptReconnection();
          }
        }, 5000);
      });

      setSocket(newSocket);
    };

    const attemptReconnection = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached');
        return;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000); // Exponential backoff
      console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts + 1})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);

        if (socket) {
          socket.disconnect();
        }

        initializeSocket();
      }, delay);
    };

    // Initialize socket on component mount
    initializeSocket();

    // AppState listener for reconnection when app becomes active
    const handleAppStateChange = (nextAppState: string) => {
      console.log('AppState changed to:', nextAppState);

      if (nextAppState === 'active') {
        // Force reconnection when app becomes active
        console.log('App became active - forcing socket reconnection');
        
        // Reset states that might affect message display
        setIsUserScrolling(false);
        
        if (socket) {
          // Always re-setup listeners and rejoin rooms for better reliability
          console.log('Re-setup listeners and rejoin rooms on app active');
          setupSocketListeners(socket);

          // Force reconnection if not connected
          if (!socket.connected) {
            console.log('Socket not connected, forcing reconnection');
            socket.disconnect();
            setTimeout(() => {
              socket.connect();
            }, 100);
          }

          // Always rejoin all rooms to ensure we're still in them using refs
          setTimeout(() => {
            const currentTabs = chatTabsRef.current;
            const currentUser = userRef.current;
            if (currentTabs.length > 0 && currentUser?.username) {
              currentTabs.forEach((tab, index) => {
                setTimeout(() => {
                  console.log('Rejoining room after app resume:', tab.id, currentUser.username);
                  if (tab.isSupport) {
                    socket.emit('join-support-room', {
                      supportRoomId: tab.id,
                      isAdmin: currentUser.role === 'admin'
                    });
                  } else {
                    socket.emit('join-room', {
                      roomId: tab.id,
                      username: currentUser.username,
                      role: currentUser.role || 'user'
                    });
                  }
                }, index * 50); // Stagger the rejoining
              });
            }
          }, 200);
        }

        // Force re-render of current chat messages
        setTimeout(() => {
          setChatTabs(prevTabs => [...prevTabs]);
        }, 300);

        // Reload participants for current room using refs
        const currentTab = chatTabsRef.current[activeTabRef.current];
        if (currentTab && currentTab.type !== 'private') {
          setTimeout(() => {
            loadParticipants();
          }, 500);
        }

        // Ensure current tab messages are visible with multiple attempts using refs
        setTimeout(() => {
          const currentTabId = chatTabsRef.current[activeTabRef.current]?.id;
          if (currentTabId && flatListRefs.current[currentTabId]) {
            flatListRefs.current[currentTabId]?.scrollToEnd({ animated: false });
          }
        }, 600);
        
        // Second attempt to ensure scrolling
        setTimeout(() => {
          const currentTabId = chatTabsRef.current[activeTabRef.current]?.id;
          if (currentTabId && flatListRefs.current[currentTabId]) {
            flatListRefs.current[currentTabId]?.scrollToEnd({ animated: true });
          }
        }, 1000);
        
      } else if (nextAppState === 'background') {
        console.log('App moved to background - maintaining socket connection');
        // Don't disconnect socket when going to background
        // Keep connection alive for better message delivery
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      console.log('Cleaning up socket connection');

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      appStateSubscription?.remove();

      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, []);

  // Add keyboard event listeners for better input handling
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

  useEffect(() => {
    // If navigated with specific room/chat ID, join it immediately
    if (roomId && roomName && socket) {
      console.log('Navigated to specific room/chat:', roomId, roomName, type);
      joinSpecificRoom(roomId, roomName);
    }
  }, [roomId, roomName, socket, type, isSupport]);

  // Effect untuk mempertahankan state pesan saat app kembali aktif
  useEffect(() => {
    const preserveMessageState = () => {
      // Pastikan semua pesan tetap terlihat setelah app kembali aktif
      if (chatTabs.length > 0 && activeTab >= 0 && chatTabs[activeTab]) {
        const currentTab = chatTabs[activeTab];
        console.log(`Preserving messages for tab: ${currentTab.title}, Messages count: ${currentTab.messages.length}`);
        
        // Force update FlatList jika ada pesan
        if (currentTab.messages.length > 0) {
          setTimeout(() => {
            const currentRoomId = currentTab.id;
            if (flatListRefs.current[currentRoomId]) {
              flatListRefs.current[currentRoomId]?.scrollToEnd({ animated: false });
            }
          }, 100);
        }
      }
    };

    // Jalankan preserveMessageState saat component di-mount
    preserveMessageState();
  }, [chatTabs.length, activeTab]);

  useEffect(() => {
    // If navigated from RoomScreen or ProfileScreen, focus on that specific room/chat
    // Only run this on initial load, not when chatTabs changes
    if (roomId && autoFocusTab && chatTabs.length > 0 && activeTab === 0) {
      const tabIndex = chatTabs.findIndex(tab => tab.id === roomId);
      if (tabIndex !== -1) {
        setActiveTab(tabIndex);
        // Scroll to the active tab
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            x: tabIndex * width,
            animated: true
          });
        }
      }
    }
  }, [roomId, autoFocusTab, chatTabs.length]);

  // Socket listeners are now managed in the main socket initialization useEffect above

  const loadRooms = async () => {
    try {
      console.log('Loading rooms from:', `${API_BASE_URL}/api/rooms`);
      const response = await fetch(`${API_BASE_URL}/api/rooms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Rooms response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      console.log('Rooms response body:', responseText);

      const rooms = JSON.parse(responseText);

      // Only load specific room if navigating from RoomScreen with specific roomId
      if (roomId && roomName && !chatTabs.length) {
        // Find and load the specific room
        const targetRoom = rooms.find((room: any) => room.id.toString() === roomId.toString());

        if (targetRoom) {
          try {
            const messagesResponse = await fetch(`${API_BASE_URL}/api/messages/${targetRoom.id}`, {
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChatMe-Mobile-App',
              },
            });
            const messages = messagesResponse.ok ? await messagesResponse.json() : [];

            const newTab: ChatTab = {
              id: targetRoom.id.toString(),
              title: targetRoom.name,
              type: targetRoom.type || 'room',
              messages: messages,
              managedBy: targetRoom.managed_by || targetRoom.createdBy || 'admin',
              description: targetRoom.description || `${targetRoom.name} room`,
              moderators: targetRoom.moderators || []
            };

            setChatTabs([newTab]);
            setActiveTab(0);

            // Join room via socket (participant automatically added by gateway)
            if (user?.username) {
              socket?.emit('join-room', {
                roomId: targetRoom.id.toString(),
                username: user?.username || 'Guest',
                role: user?.role || 'user'
              });
            }
          } catch (error) {
            console.error(`Error loading room ${targetRoom.id}:`, error);
          }
        } else {
          console.log(`Room ${roomId} not found in available rooms`);
        }
      }
      // Don't clear existing tabs if user already has multiple tabs open
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  const handleTabPress = (index: number) => {
    setActiveTab(index);

    // Update current room ID
    const selectedRoomId = chatTabs[index]?.id;
    if (selectedRoomId) {
      setCurrentRoomId(selectedRoomId);
    }

    // Scroll to the selected tab
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: index * width,
        animated: true
      });
    }

    // Clear unread count for the selected tab
    if (selectedRoomId && unreadCounts[selectedRoomId]) {
      setUnreadCounts(prev => ({
        ...prev,
        [selectedRoomId]: 0
      }));
    }

    // Reset scroll state when switching tabs
    setIsUserScrolling(false);

    // Ensure messages are visible in the new tab with multiple attempts
    setTimeout(() => {
      if (chatTabs[index] && chatTabs[index].messages.length > 0) {
        console.log(`Switching to tab ${index}: ${chatTabs[index].title}, Messages: ${chatTabs[index].messages.length}`);
        if (flatListRefs.current[selectedRoomId]) {
          flatListRefs.current[selectedRoomId]?.scrollToEnd({ animated: false });
        }
      }
    }, 100);
    
    // Second attempt for better reliability
    setTimeout(() => {
      if (chatTabs[index] && chatTabs[index].messages.length > 0) {
        if (flatListRefs.current[selectedRoomId]) {
          flatListRefs.current[selectedRoomId]?.scrollToEnd({ animated: true });
        }
      }
    }, 300);
  };


  const getRoleColor = (role?: string, username?: string, currentRoomId?: string) => {
    // Admin role takes highest precedence
    if (role === 'admin') return '#FF6B35'; // Orange Red for admin

    // Check if user is owner of current room
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(username);

    if (isOwner) return '#e8d31a'; // Gold/Yellow for room owner
    if (isModerator) return '#e8d31a'; // Gold/Yellow for room moderator

    switch (role) {
      case 'user': return '#2196F3'; // Blue
      case 'merchant': return '#9C27B0'; // Purple
      case 'mentor': return '#eb0e0e'; // Deep Orange
      default: return '#2196F3'; // Default to blue
    }
  };

  // Helper function to get level badge color (gradient green to blue)
  const getLevelBadgeColor = (level: number) => {
    if (level >= 10) {
      return '#2196F3'; // Full blue at level 10+
    }
    // Gradient from green to blue (levels 1-9)
    const ratio = (level - 1) / 9; // 0 at level 1, 1 at level 9
    const redValue = Math.round(76 + ratio * (-43)); // 76 to 33
    const greenValue = Math.round(175 + ratio * 68); // 175 to 243
    const blueValue = Math.round(80 + ratio * 27); // 80 to 107
    
    return `rgb(${redValue}, ${greenValue}, ${blueValue})`;
  };

  const getRoleBackgroundColor = (role?: string, username?: string, currentRoomId?: string) => {
    // Admin role takes highest precedence
    if (role === 'admin') return '#FFEBEE'; // Light red background for admin

    // Check if user is owner of current room
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(username);

    if (isOwner) return '#fefce8'; // Light yellow background for room owner
    if (isModerator) return '#fefce8'; // Light yellow background for room moderator

    switch (role) {
      case 'user': return '#E3F2FD'; // Light blue background
      case 'merchant': return '#F3E5F5'; // Light purple background
      case 'mentor': return '#FBE9E7'; // Light orange background
      default: return '#E3F2FD'; // Default light blue background
    }
  };

  const getRoleBadge = (role?: string, username?: string, currentRoomId?: string) => {
    // Remove all role badges
    return '';
  };

  const formatTime = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const handleMessageChange = (text: string) => {
    setMessage(text);

    // Check for @ symbol to trigger user tagging
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const searchText = text.substring(lastAtIndex + 1);

      if (searchText.length === 0) {
        // Show all participants when @ is typed
        setFilteredParticipants(participants);
        setShowUserTagMenu(true);
        setTagSearchQuery('');
      } else if (searchText.length > 0 && !searchText.includes(' ')) {
        // Filter participants based on search
        const filtered = participants.filter(participant =>
          participant.username.toLowerCase().includes(searchText.toLowerCase())
        );
        setFilteredParticipants(filtered);
        setShowUserTagMenu(filtered.length > 0);
        setTagSearchQuery(searchText);
      } else {
        setShowUserTagMenu(false);
      }
    } else {
      setShowUserTagMenu(false);
    }
  };

  const handleUserTag = (username: string) => {
    const lastAtIndex = message.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const beforeAt = message.substring(0, lastAtIndex);
      const afterSearch = message.substring(lastAtIndex + 1 + tagSearchQuery.length);
      setMessage(`${beforeAt}@${username} ${afterSearch}`);
    }
    setShowUserTagMenu(false);
    setTagSearchQuery('');
  };

  const handleSpecialCommand = (commandMessage: string, currentRoomId: string) => {
    const parts = commandMessage.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Don't show command message in UI - only show system responses
    // This prevents commands like /roll, /me, /whois from appearing as user messages

    switch (command) {
      case '/me': {
        if (args.length > 0) {
          const actionText = args.join(' ');
          const meMessage = {
            id: `me_${Date.now()}_${user?.username}`,
            sender: user?.username || 'User',
            content: `${actionText}`,
            timestamp: new Date(),
            roomId: currentRoomId,
            role: user?.role || 'user',
            level: user?.level || 1,
            type: 'me'
          };

          // Add locally and emit to server
          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, meMessage] }
                : tab
            )
          );

          socket?.emit('sendMessage', {
            roomId: currentRoomId,
            sender: user?.username || 'User',
            content: `${actionText}`,
            role: user?.role || 'user',
            level: user?.level || 1,
            type: 'me'
          });
        }
        break;
      }

      case '/whois': {
        if (args.length > 0) {
          const targetUsername = args[0];
          const targetUser = participants.find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

          console.log('Processing /whois command for:', targetUsername, 'Found user:', !!targetUser);

          if (targetUser) {
            const whoisMessage = {
              id: `whois_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `📋 User Info: ${targetUser.username}\n🌍 Country: ${targetUser.country || 'Unknown'}\n⭐ Level: ${targetUser.level || 1}\n🔰 Role: ${targetUser.role || 'user'}\n⏰ Status: ${targetUser.isOnline ? 'Online' : 'Offline'}\n⏰ Last Seen: ${targetUser.lastSeen || 'Unknown'}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'message'
            };

            // Add locally for immediate feedback
            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, whoisMessage] }
                  : tab
              )
            );

            console.log('Whois message added locally');
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' not found in this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'message'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /whois [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'message'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/roll': {
        const max = args[0] ? parseInt(args[0]) : 100;

        console.log('Processing /roll command, max:', max);

        // Just emit the command to server, let server handle rolling and broadcasting
        socket?.emit('sendMessage', {
          roomId: currentRoomId,
          sender: user?.username || 'Guest',
          content: `/roll ${max}`,
          role: user?.role || 'user',
          level: user?.level || 1,
          type: 'command'
        });
        break;
      }

      case '/gift': {
        if (args.length >= 4 && args[0] === 'send' && args[2] === 'to') {
          // Handle: /gift send rose to username
          const giftItem = args[1];
          const targetUsername = args[3];

          const targetUser = participants.find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

          if (targetUser) {
            const giftMessage = {
              id: `gift_cmd_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `🎁 ${user?.username} sent ${giftItem} to ${targetUsername}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'gift'
            };

            // Add locally and emit to server
            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, giftMessage] }
                  : tab
              )
            );

            socket?.emit('sendMessage', {
              roomId: currentRoomId,
              sender: 'System',
              content: `🎁 ${user?.username} sent ${giftItem} to ${targetUsername}`,
              role: 'system',
              level: 1,
              type: 'gift'
            });
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' not found in this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'error'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /gift send [item] to [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/ban': {
        // Check if user has permission to ban user
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
        const isAdmin = user?.role === 'admin';

        if (!isOwner && !isModerator && !isAdmin) {
          const errorMessage = {
            id: `error_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Only room owner, moderators, or admins can ban users.',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, errorMessage] }
                : tab
            )
          );
          break;
        }

        if (args.length > 0) {
          const targetUsername = args[0];
          const targetUser = participants.find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

          if (targetUser) {
            const banMessage = {
              id: `ban_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `🚫 ${targetUsername} has been banned from the room by ${user?.username}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'ban'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, banMessage] }
                  : tab
              )
            );

            socket?.emit('sendMessage', {
              roomId: currentRoomId,
              sender: 'System',
              content: `🚫 ${targetUsername} has been banned from the room by ${user?.username}`,
              role: 'system',
              level: 1,
              type: 'ban'
            });
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' not found in this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'error'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /ban [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/kick': {
        // Check if user has permission to kick
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
        const isAdmin = user?.role === 'admin';

        if (!isOwner && !isModerator && !isAdmin) {
          const errorMessage = {
            id: `error_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Only room owner, moderators, or admins can kick users.',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, errorMessage] }
                : tab
            )
          );
          break;
        }

        if (args.length > 0) {
          const targetUsername = args[0];
          const targetUser = participants.find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

          if (targetUser) {
            const kickMessage = {
              id: `kick_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `👢 ${targetUsername} has been kicked from the room by ${user?.username}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'kick'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, kickMessage] }
                  : tab
              )
            );

            socket?.emit('kick-user', {
              roomId: currentRoomId,
              kickedUser: targetUsername,
              kickedBy: user?.username
            });
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' not found in this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'error'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /kick [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/lock': {
        // Check if user has permission to lock room
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
        const isAdmin = user?.role === 'admin';

        if (!isOwner && !isModerator && !isAdmin) {
          const errorMessage = {
            id: `error_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Only room owner, moderators, or admins can lock the room.',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, errorMessage] }
                : tab
            )
          );
          break;
        }

        if (args.length > 0) {
          const password = args.join(' ');

          // Emit lock room command to server
          socket?.emit('lock-room', {
            roomId: currentRoomId,
            password: password,
            lockedBy: user?.username
          });

          const lockMessage = {
            id: `lock_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: `🔒 Room has been locked by ${user?.username}. New users will need a password to enter.`,
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'lock'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, lockMessage] }
                : tab
            )
          );

          socket?.emit('sendMessage', {
            roomId: currentRoomId,
            sender: 'System',
            content: `🔒 Room has been locked by ${user?.username}. New users will need a password to enter.`,
            role: 'system',
            level: 1,
            type: 'lock'
          });
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /lock [password]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/ban': {
        // Check if user has permission to ban user
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
        const isAdmin = user?.role === 'admin';

        if (!isOwner && !isModerator && !isAdmin) {
          const errorMessage = {
            id: `error_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Only room owner, moderators, or admins can ban users.',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, errorMessage] }
                : tab
            )
          );
          break;
        }

        if (args.length > 0) {
          const targetUsername = args[0];
          const targetUser = participants.find(p => p.username.toLowerCase() === targetUsername.toLowerCase());

          if (targetUser) {
            const banMessage = {
              id: `ban_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `🚫 ${targetUsername} has been banned from the room by ${user?.username}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'ban'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, banMessage] }
                  : tab
              )
            );

            setBannedUsers(prev => [...prev, targetUsername]);

            socket?.emit('ban-user', {
              roomId: currentRoomId,
              bannedUser: targetUsername,
              bannedBy: user?.username,
              action: 'ban'
            });
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' not found in this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'error'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /ban [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/unban': {
        // Check if user has permission to unban user
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(user?.username);
        const isAdmin = user?.role === 'admin';

        if (!isOwner && !isModerator && !isAdmin) {
          const errorMessage = {
            id: `error_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Only room owner, moderators, or admins can unban users.',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, errorMessage] }
                : tab
            )
          );
          break;
        }

        if (args.length > 0) {
          const targetUsername = args[0];

          if (bannedUsers.includes(targetUsername)) {
            const unbanMessage = {
              id: `unban_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `✅ ${targetUsername} has been unbanned from the room by ${user?.username}`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'unban'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, unbanMessage] }
                  : tab
              )
            );

            setBannedUsers(prev => prev.filter(username => username !== targetUsername));

            socket?.emit('ban-user', {
              roomId: currentRoomId,
              bannedUser: targetUsername,
              bannedBy: user?.username,
              action: 'unban'
            });
          } else {
            const errorMessage = {
              id: `error_${Date.now()}_${user?.username}`,
              sender: 'System',
              content: `❌ User '${targetUsername}' is not banned from this room.`,
              timestamp: new Date(),
              roomId: currentRoomId,
              role: 'system',
              level: 1,
              type: 'error'
            };

            setChatTabs(prevTabs =>
              prevTabs.map(tab => 
                tab.id === currentRoomId
                  ? { ...tab, messages: [...tab.messages, errorMessage] }
                  : tab
              )
            );
          }
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /unban [username]',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      case '/bot': {
        if (args.length >= 2 && args[0] === 'lowcard' && args[1] === 'add') {
          // Handle: /bot lowcard add
          socket?.emit('sendMessage', {
            roomId: currentRoomId,
            sender: user?.username,
            content: '/bot lowcard add',
            role: user?.role || 'user',
            level: user?.level || 1,
            type: 'command',
            commandType: 'bot'
          });
        } else {
          const helpMessage = {
            id: `help_${Date.now()}_${user?.username}`,
            sender: 'System',
            content: '❌ Usage: /bot lowcard add',
            timestamp: new Date(),
            roomId: currentRoomId,
            role: 'system',
            level: 1,
            type: 'error'
          };

          setChatTabs(prevTabs =>
            prevTabs.map(tab => 
              tab.id === currentRoomId
                ? { ...tab, messages: [...tab.messages, helpMessage] }
                : tab
            )
          );
        }
        break;
      }

      default: {
        const unknownMessage = {
          id: `unknown_${Date.now()}_${user?.username}`,
          sender: 'System',
          content: '❌ Unknown command: ${command}\n\nAvailable commands:\n/me [action] - Perform an action\n/whois [username] - Get user info\n/roll - Roll dice (1-100)\n/gift send [item] to [username] - Send gift\n/kick [username] - Kick user (admin/mentor)\n/ban [username] - Ban user (admin/moderator/owner)\n/unban [username] - Unban user (admin/moderator/owner)\n/lock [password] - Lock room (admin/moderator/owner)\n/bot lowcard add - Add LowCard bot',
          timestamp: new Date(),
          roomId: currentRoomId,
          role: 'system',
          level: 1,
          type: 'error'
        };

        setChatTabs(prevTabs =>
          prevTabs.map(tab => 
            tab.id === currentRoomId
              ? { ...tab, messages: [...tab.messages, unknownMessage] }
              : tab
          )
        );
        break;
      }
    }

    // Auto-scroll after command
    setTimeout(() => {
      flatListRefs.current[currentRoomId]?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSendMessage = async () => {
    // Check if socket is connected
    if (!isSocketConnected || !socket?.connected) {
      Alert.alert('Connection Lost', 'Reconnecting to server... Please try again in a moment.');
      return;
    }

    // Check if user is muted (only for rooms, not private chats or support chats)
    if (chatTabs[activeTab]?.type !== 'private' && !chatTabs[activeTab]?.isSupport && mutedUsers.includes(user?.username || '')) {
      Alert.alert('You are muted', 'You cannot send messages because you have been muted by an admin');
      return;
    }

    // Check if there's either text or queued emojis
    if ((message.trim() || selectedImageEmojis.length > 0) && socket && user && chatTabs[activeTab]) {
      const currentRoomId = chatTabs[activeTab].id;
      const currentTab = chatTabs[activeTab];
      
      // Build message content: text + queued image emojis
      let messageContent = message.trim();
      
      // Append queued image emojis as tags
      if (selectedImageEmojis.length > 0) {
        const emojiTags = selectedImageEmojis.map(emoji => {
          if (typeof emoji.url === 'string' && emoji.url.startsWith('/')) {
            return `<img:${emoji.url}>`;
          } else if (typeof emoji.url === 'number') {
            return `<localimg:${emoji.name}>`;
          } else {
            return `<img:${emoji.url}>`;
          }
        }).join(' ');
        
        messageContent = messageContent ? `${messageContent} ${emojiTags}` : emojiTags;
      }

      // Handle special commands (only for non-support chats)
      if (messageContent.startsWith('/') && !currentTab?.isSupport) {
        handleSpecialCommand(messageContent, currentRoomId);
        setMessage('');
        setSelectedImageEmojis([]);
        setShowUserTagMenu(false);
        return;
      }

      // Create optimistic message object
      const optimisticMessage = {
        id: `temp_${Date.now()}_${user.username}`,
        sender: user.username,
        content: messageContent,
        timestamp: new Date(),
        roomId: currentRoomId,
        role: user.role || 'user',
        level: user.level || 1,
        type: currentTab?.isSupport ? 'support' : 'message' // Set type based on tab
      };

      // Clear message and queued emojis immediately
      setMessage('');
      setSelectedImageEmojis([]);
      setShowUserTagMenu(false);
      
      // Reset scroll state to ensure autoscroll works after sending message
      setIsUserScrolling(false);

      // Add message optimistically to UI first (instant feedback)
      setChatTabs(prevTabs =>
        prevTabs.map(tab => 
          tab.id === currentRoomId
            ? { ...tab, messages: [...tab.messages, optimisticMessage] }
            : tab
        )
      );

      // Auto-scroll immediately with better timing
      setTimeout(() => {
        console.log('Auto-scrolling after message send for room:', currentRoomId);
        if (flatListRefs.current[currentRoomId]) {
          flatListRefs.current[currentRoomId]?.scrollToEnd({ animated: true });
        }
      }, 100);

      // Determine if this is a command
      let type = 'message';
      let commandType = null;

      if (messageContent.startsWith('/') && !currentTab?.isSupport) {
        type = 'command';
        if (messageContent.toLowerCase().includes('bot')) {
          commandType = 'bot';
        } else {
          commandType = 'system';
        }
      }

      // Then emit to server
      const messageData = {
        roomId: currentRoomId,
        sender: user.username,
        content: messageContent,
        role: user.role || 'user',
        level: user.level || 1,
        type: type,
        commandType: commandType,
        tempId: optimisticMessage.id // Include temp ID for replacement
      };

      if (currentTab?.isSupport) {
        // Send support message
        socket.emit('support-message', {
          supportRoomId: currentRoomId,
          content: messageContent,
          isAdmin: user?.role === 'admin',
          sender: user.username, // Include sender for support messages as well
          role: user.role || 'user',
          level: user.level || 1,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Send regular message
        socket.emit('sendMessage', messageData);
      }
    }
  };

  const handleBackPress = () => {
    // Always navigate to Room screen instead of going back to Home
    navigation.goBack();
  };

  const handleEllipsisPress = () => {
    setShowPopupMenu(true);
  };

  const handleLeaveRoom = () => {
    setShowPopupMenu(false);

    if (socket && chatTabs[activeTab] && user) {
      const currentRoomId = chatTabs[activeTab].id;
      const currentActiveTab = activeTab;

      // Leave the room via socket
      if (chatTabs[activeTab].isSupport) {
        socket.emit('leave-support-room', { supportRoomId: currentRoomId });
      } else {
        socket.emit('leave-room', {
          roomId: currentRoomId,
          username: user.username || 'Guest',
          role: user.role || 'user'
        });
      }

      // Clear participants for this room
      setParticipants([]);

      // Clear unread count for this room
      setUnreadCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[currentRoomId];
        return newCounts;
      });

      // Clear flatListRef for this room
      if (flatListRefs.current[currentRoomId]) {
        delete flatListRefs.current[currentRoomId];
      }

      // Remove the tab from chatTabs and navigate to Room screen
      setChatTabs(prevTabs => {
        const newTabs = prevTabs.filter((_, index) => index !== currentActiveTab);

        // If no tabs left, navigate to Room screen
        if (newTabs.length === 0) {
          setTimeout(() => {
            navigation.navigate('Room');
          }, 100);
        } else {
          // Set new active tab if there are remaining tabs
          const newActiveTab = currentActiveTab >= newTabs.length
            ? newTabs.length - 1
            : currentActiveTab;

          setTimeout(() => {
            setActiveTab(newActiveTab);
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                x: newActiveTab * width,
                animated: true
              });
            }
          }, 100);
        }

        return newTabs;
      });
    }
  };

  const handleRoomInfo = () => {
    setShowPopupMenu(false);
    setShowRoomInfo(true);
  };

  const loadParticipants = async () => {
    try {
      if (chatTabs[activeTab]) {
        const currentRoomId = chatTabs[activeTab].id;
        const isSupportChat = chatTabs[activeTab].isSupport;
        let endpoint = `${API_BASE_URL}/rooms/${currentRoomId}/participants`;
        if (isSupportChat) {
          endpoint = `${API_BASE_URL}/support/${currentRoomId}/participants`;
        }

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ChatMe-Mobile-App',
          },
        });

        if (response.ok) {
          const participantData = await response.json();
          // Only update if we're still on the same room (prevent race conditions)
          if (chatTabs[activeTab] && chatTabs[activeTab].id === currentRoomId) {
            setParticipants(participantData);
            setFilteredParticipants(participantData); // Update filtered list too
            console.log('Participants loaded for room', currentRoomId, ':', participantData.length);

            // Update the "Currently in the room" message with actual participants
            if (chatTabs[activeTab].type !== 'private' && !isSupportChat && participantData.length > 0) {
              const participantNames = participantData.map(p => p.username).join(', ');
              const updatedContent = `Currently in the room: ${participantNames}`;

              setChatTabs(prevTabs =>
                prevTabs.map(tab => {
                  if (tab.id === currentRoomId) {
                    const updatedMessages = tab.messages.map(msg => {
                      if (msg.id === `room_info_current_${currentRoomId}`) {
                        return { ...msg, content: updatedContent };
                      }
                      return msg;
                    });
                    return { ...tab, messages: updatedMessages };
                  }
                  return tab;
                })
              );
            }
          }
        } else {
          console.error('Failed to load participants for room', currentRoomId);
          setParticipants([]);
          setFilteredParticipants([]);
        }
      }
    } catch (error) {
      console.error('Error loading participants:', error);
      setParticipants([]);
      setFilteredParticipants([]);
    }
  };

  // addParticipantToRoom removed - participants are automatically added by socket gateway on join-room event
  // This prevents duplicate participant additions and "Failed to add participant to room" errors

  const handleListPress = async () => {
    await loadParticipants();
    setShowParticipants(true);
  };

  const handleEmojiPress = () => {
    loadEmojis(); // Load emojis when the picker is opened
    setShowEmojiPicker(true);
  };

  const handleEmojiSelect = (selectedEmoji: any) => {
    if (selectedEmoji.type === 'image' && selectedEmoji.url) {
      // For image emojis, add to queue with unique ID
      const emojiWithId = {
        ...selectedEmoji,
        uniqueId: `${Date.now()}_${Math.random()}`,
      };
      setSelectedImageEmojis(prev => [...prev, emojiWithId]);
      setShowEmojiPicker(false);
    } else if (selectedEmoji.emoji) {
      // For text emojis, add to input text
      setMessage(prev => prev + selectedEmoji.emoji);
      setShowEmojiPicker(false);
    } else {
      // Fallback to name if no emoji character available
      setMessage(prev => prev + selectedEmoji.name);
      setShowEmojiPicker(false);
    }
  };

  const handleRemoveImageEmoji = (uniqueId: string) => {
    setSelectedImageEmojis(prev => prev.filter(emoji => emoji.uniqueId !== uniqueId));
  };

  const handleParticipantPress = (participant: any) => {
    console.log('Participant pressed:', participant);
    setSelectedParticipant(participant);
    setShowParticipantMenu(true);
  };

  const handleViewProfile = () => {
    setShowParticipantMenu(false);
    setShowParticipants(false);
    // Navigate to profile screen using username
    navigation.navigate('Profile', { userId: selectedParticipant?.username });
  };

  const handleOpenChat = async () => {
    setShowParticipantMenu(false);
    setShowParticipants(false);

    try {
      console.log('Creating private chat between:', user?.username, 'and', selectedParticipant?.username);

      if (!selectedParticipant?.username) {
        Alert.alert('Error', 'Selected participant is invalid');
        return;
      }

      // Create private chat via API
      const response = await fetch(`${API_BASE_URL}/api/chat/private`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          participants: [user?.username, selectedParticipant?.username],
          initiatedBy: user?.username
        }),
      });

      console.log('Private chat response status:', response.status);

      if (response.ok) {
        const privateChat = await response.json();
        console.log(privateChat.isExisting ? 'Existing private chat found:' : 'Private chat created successfully:', privateChat.id);

        // Ensure targetUser has proper structure with id
        const targetUser = {
          id: selectedParticipant?.id || selectedParticipant?.username || Date.now().toString(),
          username: selectedParticipant?.username,
          role: selectedParticipant?.role || 'user',
          level: selectedParticipant?.level || 1,
          avatar: selectedParticipant?.avatar || null
        };

        // Navigate to private chat (existing or new)
        navigation.navigate('Chat', {
          roomId: privateChat.id,
          roomName: `Chat with ${selectedParticipant?.username}`,
          roomDescription: `Private chat with ${selectedParticipant?.username}`,
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
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to create private chat`);
      }
    } catch (error) {
      console.error('Error creating private chat:', error);
      Alert.alert('Error', error.message || 'Failed to create private chat');
    }
  };

  const handleKickUser = async () => {
    if (!selectedParticipant?.username) {
      Alert.alert('Error', 'No user selected');
      return;
    }

    setShowParticipantMenu(false);

    Alert.alert(
      'Kick User',
      `Are you sure you want to kick ${selectedParticipant?.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: async () => {
            try {
              const roomId = chatTabs[activeTab]?.id;
              if (!roomId) {
                Alert.alert('Error', 'No active room found');
                return;
              }

              // Show loading
              Alert.alert('Processing', 'Kicking user...');

              // Emit kick event via socket - server will handle permission checking
              socket?.emit('kick-user', {
                roomId,
                targetUsername: selectedParticipant.username,
                reason: 'Kicked by moderator'
              });

            } catch (error) {
              console.error('Error kicking user:', error);
              Alert.alert('Error', 'Failed to kick user. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleBlockUser = () => {
    setShowParticipantMenu(false);

    const isBlocked = blockedUsers.includes(selectedParticipant?.username);

    if (isBlocked) {
      setBlockedUsers(prev => prev.filter(username => username !== selectedParticipant?.username));
      Alert.alert('Success', `${selectedParticipant?.username} has been unblocked`);
    } else {
      setBlockedUsers(prev => [...prev, selectedParticipant?.username]);
      Alert.alert('Success', `${selectedParticipant?.username} has been blocked. You won\'t see their messages.`);
    }
  };

  const handleMuteUser = async () => {
    if (user?.role !== 'admin') {
      Alert.alert('Error', 'Only admins can mute users');
      return;
    }

    setShowParticipantMenu(false);

    const isMuted = mutedUsers.includes(selectedParticipant?.username);

    Alert.alert(
      isMuted ? 'Unmute User' : 'Mute User',
      `Are you sure you want to ${isMuted ? 'unmute' : 'mute'} ${selectedParticipant?.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isMuted ? 'Unmute' : 'Mute',
          onPress: () => {
            if (isMuted) {
              setMutedUsers(prev => prev.filter(username => username !== selectedParticipant?.username));
              Alert.alert('Success', `${selectedParticipant?.username} has been unmuted`);
            } else {
              setMutedUsers(prev => [...prev, selectedParticipant?.username]);
              Alert.alert('Success', `${selectedParticipant?.username} has been muted`);
            }

            // Emit mute event via socket
            socket?.emit('mute-user', {
              roomId: chatTabs[activeTab]?.id,
              mutedUser: selectedParticipant?.username,
              mutedBy: user?.username,
              action: isMuted ? 'unmute' : 'mute'
            });
          }
        }
      ]
    );
  };

  const handleBanUser = async () => {
    if (!isRoomOwner() && !isRoomModerator() && user?.role !== 'admin') {
      Alert.alert('Error', 'Only room owner, moderators, or admins can ban users');
      return;
    }

    setShowParticipantMenu(false);

    const isBanned = bannedUsers.includes(selectedParticipant?.username);

    Alert.alert(
      isBanned ? 'Unban User' : 'Ban User',
      `Are you sure you want to ${isBanned ? 'unban' : 'ban'} ${selectedParticipant?.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBanned ? 'Unban' : 'Ban',
          style: 'destructive',
          onPress: () => {
            if (isBanned) {
              setBannedUsers(prev => prev.filter(username => username !== selectedParticipant?.username));
              Alert.alert('Success', `${selectedParticipant?.username} has been unbanned`);
            } else {
              setBannedUsers(prev => [...prev, selectedParticipant?.username]);
              Alert.alert('Success', `${selectedParticipant?.username} has been banned from this room`);
            }

            // Emit ban/unban event to server
            socket?.emit('ban-user', {
              roomId: currentRoomId,
              bannedUser: selectedParticipant?.username,
              bannedBy: user?.username,
              action: isBanned ? 'unban' : 'ban'
            });
          }
        }
      ]
    );
  };

  const handleLockRoom = async () => {
    if (!isRoomOwner() && !isRoomModerator() && user?.role !== 'admin') {
      Alert.alert('Error', 'Only room owner, moderators, or admins can lock the room');
      return;
    }

    setShowParticipantMenu(false);

    Alert.alert(
      'Lock Room',
      'Enter password to lock this room:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock',
          onPress: () => {
            Alert.prompt(
              'Room Password',
              'Enter a password for this room:',
              (password) => {
                if (password && password.trim()) {
                  socket?.emit('lock-room', {
                    roomId: currentRoomId,
                    password: password.trim(),
                    lockedBy: user?.username
                  });
                  Alert.alert('Success', 'Room has been locked with password');
                }
              },
              'plain-text'
            );
          }
        }
      ]
    );
  };

  const handleReportUser = () => {
    setShowParticipantMenu(false);

    Alert.alert(
      'Report User',
      'Please select a reason for reporting this user:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Spam',
          onPress: () => sendReport('spam')
        },
        {
          text: 'Harassment',
          onPress: () => sendReport('harassment')
        },
        {
          text: 'Inappropriate Content',
          onPress: () => sendReport('inappropriate')
        },
        {
          text: 'Other',
          onPress: () => sendReport('other')
        }
      ]
    );
  };

  const sendReport = (reason: string) => {
    try {
      const reportMessage = {
        roomId: 'admin_reports',
        sender: user?.username,
        content: `REPORT: User ${selectedParticipant?.username} reported for ${reason} by ${user?.username} in room ${chatTabs[activeTab]?.title}`,
        timestamp: new Date(),
        type: 'report'
      };

      // Send report to admin channel via socket
      socket?.emit('send-report', reportMessage);

      Alert.alert('Success', 'Report sent to administrators');
    } catch (error) {
      Alert.alert('Error', 'Failed to send report');
    }
  };

  // Map of local emoticon names to their require paths
  const localEmoticonsMap: { [key: string]: any } = {
    'Angry Old': require('../../assets/emoticon/angryold.png'),
    'Annoyed Old': require('../../assets/emoticon/annoyedold.png'),
    'Bum': require('../../assets/emoticon/bum.png'),
    'Call Me': require('../../assets/emoticon/callme.png'),
    'Cheeky Old': require('../../assets/emoticon/cheekyold.png'),
    'Confused': require('../../assets/emoticon/confused.png'),
    'Cool Old': require('../../assets/emoticon/coolold.png'),
    'Cry': require('../../assets/emoticon/cry.png'),
    'Curious Old': require('../../assets/emoticon/curiousold.png'),
    'Dies': require('../../assets/emoticon/dies.png'),
    'Disgust Old': require('../../assets/emoticon/disgustold.png'),
    'Dizzy': require('../../assets/emoticon/dizzy.png'),
    'Drooling': require('../../assets/emoticon/drooling.png'),
    'Err': require('../../assets/emoticon/err.png'),
    'Football': require('../../assets/emoticon/ffootball.png'),
    'Football Trophy': require('../../assets/emoticon/ffootballtrophy.png'),
    'Goal': require('../../assets/emoticon/fgoal.png'),
    'Goal Post': require('../../assets/emoticon/fgoalpost.png'),
    'Golden Boot': require('../../assets/emoticon/fgoldenboot.png'),
    'Hat': require('../../assets/emoticon/fhat.png'),
    'Flirt': require('../../assets/emoticon/flirt.png'),
    'Mint': require('../../assets/emoticon/fmint.png'),
    'Player': require('../../assets/emoticon/fplayer.png'),
    'Red Boot': require('../../assets/emoticon/fredboot.png'),
    'Red Card': require('../../assets/emoticon/fredcard.png'),
    'Red Jersey': require('../../assets/emoticon/fredjersey.png'),
    'Red Pants': require('../../assets/emoticon/fredpants.png'),
    'Referee': require('../../assets/emoticon/freferee.png'),
    'Ring': require('../../assets/emoticon/fring.png'),
    'Scarf': require('../../assets/emoticon/fscarf.png'),
    'Silver Ball': require('../../assets/emoticon/fsilverball.png'),
    'Soccer Toy': require('../../assets/emoticon/fsoccertoy.png'),
    'Socks': require('../../assets/emoticon/fsocks.png'),
    'Trophy': require('../../assets/emoticon/ftrophy.png'),
    'Whistle': require('../../assets/emoticon/fwhistle.png'),
    'Whistle 2': require('../../assets/emoticon/fwhistle2.png'),
    'Yellow Card': require('../../assets/emoticon/fyellowcard.png'),
    'Happy': require('../../assets/emoticon/happy.png'),
    'Hug Me': require('../../assets/emoticon/hugme.png'),
    'Hug Me 2': require('../../assets/emoticon/hugme2.png'),
    'Hypnotized': require('../../assets/emoticon/hypnotized.png'),
    'Insane': require('../../assets/emoticon/insane.png'),
    'Kiss Back': require('../../assets/emoticon/kissback.png'),
    'Kiss Lips': require('../../assets/emoticon/kisslips.png'),
    'Kiss Me': require('../../assets/emoticon/kissme.png'),
    'Kiss Old': require('../../assets/emoticon/kissold.png'),
    'Love': require('../../assets/emoticon/love.png'),
    'Nerd': require('../../assets/emoticon/nerd.png'),
    'Sad': require('../../assets/emoticon/sad.png'),
    'Shocked': require('../../assets/emoticon/shocked.png'),
    'Shy': require('../../assets/emoticon/shy.png'),
    'Shy Old': require('../../assets/emoticon/shyold.png'),
    'Silent': require('../../assets/emoticon/silent.png'),
    'Sleeping': require('../../assets/emoticon/sleeping.png'),
    'Sleepy': require('../../assets/emoticon/sleepy.png'),
    'Speechless': require('../../assets/emoticon/speechless.png'),
    'Sssh': require('../../assets/emoticon/sssh.png'),
    'Unimpressed': require('../../assets/emoticon/unimpressed.png'),
    'Very Happy': require('../../assets/emoticon/veryhappy.png'),
    'Wink': require('../../assets/emoticon/wink.png'),
    'Yuck': require('../../assets/emoticon/yuck.png'),
    'Yum': require('../../assets/emoticon/yum.png'),
  };

  const handleMessageLongPress = (message: Message) => {
    setSelectedMessage(message);
    setShowMessageMenu(true);
  };

  const handleCopyMessage = () => {
    if (selectedMessage) {
      const messageText = `${selectedMessage.sender}: ${selectedMessage.content}`;

      // Copy to clipboard
      Clipboard.setStringAsync(messageText);

      // Show success feedback
      Alert.alert(
        'Message Copied',
        'Message has been copied to clipboard',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowMessageMenu(false);
              setSelectedMessage(null);
            }
          }
        ]
      );
    }
  };

  const renderMessageContent = (content: string) => {
    // Split content by @ mentions and style them
    const parts = content.split(/(@\w+)/g);

    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        // Style @ mentions
        return (
          <Text key={index} style={styles.mentionText}>
            {part}
          </Text>
        );
      } else if (part.startsWith('<img:') && part.endsWith('>')) {
        // Extract server image URL
        const imageUrl = part.slice(5, -1);
        return (
          <Text key={index}>
            <Image
              source={{ uri: `${API_BASE_URL}${imageUrl}` }}
              style={styles.inlineEmojiImage}
              resizeMode="contain"
            />
          </Text>
        );
      } else if (part.startsWith('<localimg:') && part.endsWith('>')) {
        // Extract local image name
        const imageName = part.slice(10, -1);
        const localImageSource = localEmoticonsMap[imageName];
        if (localImageSource) {
          return (
            <Text key={index}>
              <Image
                source={localImageSource}
                style={styles.inlineEmojiImage}
                resizeMode="contain"
              />
            </Text>
          );
        }
      } else if (part.startsWith('<card:') && part.endsWith('>')) {
        // Handle card images - keep card size unchanged
        const cardImageUrl = part.slice(6, -1);
        return (
          <Image
            key={index}
            source={{ uri: `${API_BASE_URL}${cardImageUrl}` }}
            style={styles.cardImage}
            resizeMode="contain"
          />
        );
      }
      return part;
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    // Filter out messages from blocked users
    if (blockedUsers.includes(item.sender)) {
      return null;
    }

    // Handle command messages with different styles based on commandType
    if (item.type === 'command') {
      const isUserCommand = item.sender === user?.username;
      const isBotCommand = item.commandType === 'bot';
      const isSystemCommand = item.commandType === 'system';

      return (
        <TouchableOpacity 
          style={[
            styles.messageContainer,
            isBotCommand && styles.botCommandContainer,
            isSystemCommand && styles.systemCommandContainer
          ]}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.messageRow}>
            <Text style={styles.messageContent}>
              {/* Username */}
              <Text style={[
                styles.senderName,
                { 
                  color: isBotCommand ? '#167027' : isSystemCommand ? '#8B4513' : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id)
                }
              ]}>
                {item.sender}
              </Text>
              
              {/* Colon and content */}
              <Text style={{ 
                color: isBotCommand ? '#0f23bd' : '#8B4513', 
                fontWeight: 'bold',
                fontStyle: isBotCommand ? 'italic' : 'normal'
              }}>
                : {item.content}
              </Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Handle user command input (when user types /roll, /whois, etc.) - Legacy support
    if (item.content.startsWith('/') && item.sender === user?.username && item.type === 'message') {
      return (
        <TouchableOpacity 
          style={styles.messageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.messageRow}>
            <Text style={styles.messageContent}>
              {/* Username */}
              <Text style={[
                styles.senderName,
                { color: getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id) }
              ]}>
                {item.sender}
              </Text>
              
              {/* Colon and content */}
              <Text style={{ color: '#8B4513', fontWeight: 'bold' }}>
                : {item.content}
              </Text>
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Handle room info messages - same structure as regular messages but without badge
    if (item.type === 'room_info') {
      return (
        <TouchableOpacity 
          style={styles.roomInfoMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.messageRow}>
            <View style={[styles.messageContentRow, { flexDirection: 'row', alignItems: 'flex-start', flex: 1 }]}>
              <Text style={{ flex: 1 }}>
                <Text style={[styles.senderName, { color: '#d2691e' }]}>
                  {item.sender}:{' '}
                </Text>
                <Text style={[styles.messageContent, { color: '#333' }]}>
                  {item.content}
                </Text>
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }


    // Handle special command messages (me, roll, whois, gift commands, errors)
    if (item.type === 'me' || item.type === 'roll' || item.type === 'whois' || item.type === 'error') {
      return (
        <TouchableOpacity 
          style={styles.commandMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          {item.type === 'me' ? (
            <View style={styles.commandMessageRow}>
              <Text style={styles.commandContentText}>
                <Text style={[
                  styles.senderName,
                  { color: getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id) }
                ]}>
                  {item.sender} 
                </Text>
                <Text>{item.content}</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.commandMessageRow}>
              <Text style={[
                styles.commandMessageText,
                { color: '#8B4513', flex: 1 } // Coklat untuk semua command
              ]}>
                {item.content}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // Handle system messages (from System sender) - INCLUDING roll messages
    if (item.sender === 'System' || item.role === 'system') {
      console.log('Rendering system message:', item.content);
      return (
        <TouchableOpacity 
          style={styles.systemMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.systemMessageRow}>
            <Text style={[styles.systemMessageText, { color: '#8B4513', fontWeight: 'bold' }]}>
              {item.content}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Handle join/leave messages
    if (item.type === 'join' || item.type === 'leave') {
      const currentRoom = chatTabs[activeTab];
      const roomName = currentRoom?.title || 'Room';
      const username = item.sender;
      const userRole = item.userRole || 'user';

      // Get role badge
      const getRoleBadgeText = (role: string) => {
        switch (role) {
          case 'admin': return '👑';
          case 'mentor': return '🎓';
          case 'merchant': return '🏪';
          default: return '👤';
        }
      };

      const actionText = item.type === 'join' ? 'has entered' : 'has left';
      const roomColor = getRoleColor(userRole, username, chatTabs[activeTab]?.id);

      return (
        <TouchableOpacity 
          style={styles.joinLeaveMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <Text style={styles.joinLeaveMessageText}>
            <Text style={[styles.roomNameText, { color: '#d2691e' }]}>{roomName} </Text>
            <Text style={[styles.usernameText, { color: getRoleColor(userRole, username, chatTabs[activeTab]?.id) }]}>{username} </Text>
            <Text style={styles.roleBadgeText}>{getRoleBadgeText(userRole)} </Text>
            <Text style={styles.actionText}>{actionText} </Text>
            <Text style={styles.joinLeaveTime}>({formatTime(item.timestamp)})</Text>
          </Text>
        </TouchableOpacity>
      );
    }

    // Handle gift messages
    if (item.type === 'gift') {
      return (
        <TouchableOpacity 
          style={styles.giftMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.giftMessageBubble}>
            <View style={styles.messageRow}>
              <Text style={styles.giftMessageInline}>
                {/* Username */}
                <Text style={[
                  styles.senderName,
                  { color: getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id) }
                ]}>
                  {item.sender}{' '}
                </Text>
                
                {/* Level badge - small circle */}
                <View style={[styles.giftLevelCircle, { backgroundColor: getLevelBadgeColor(item.level || 1) }]}>
                  <Text style={styles.giftLevelText}>{item.level || 1}</Text>
                </View>
                
                {/* Colon and content */}
                <Text>
                  {' '}: {renderMessageContent(item.content)}
                </Text>
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Render support messages differently
    if (item.type === 'support') {
      const senderIsAdmin = item.role === 'admin';
      const senderColor = senderIsAdmin ? '#FF6B35' : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id);

      return (
        <TouchableOpacity 
          style={styles.supportMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.supportMessageBubble}>
            <View style={styles.messageRow}>
              <Text style={styles.messageContent}>
                {/* Username */}
                <Text style={[styles.senderName, { color: senderColor }]}>
                  {item.sender} {senderIsAdmin && '(Admin)'}
                </Text>
                
                {/* Colon and message content */}
                <Text style={{ color: '#333' }}>
                  : {renderMessageContent(item.content)}
                </Text>
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Regular message
    const userColor = (item.sender === 'LowCardBot' || item.sender === 'chatme_bot') ? '#167027' : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id);
    const contentColor = (item.sender === 'LowCardBot' || item.sender === 'chatme_bot') ? '#0f23bd' : '#333';
    
    return (
      <TouchableOpacity 
        style={styles.messageContainer}
        onLongPress={() => handleMessageLongPress(item)}
      >
        <View style={styles.messageRow}>
          <Text style={styles.messageContent}>
            {/* Username */}
            <Text style={[styles.senderName, { color: userColor }]}>
              {item.sender}
            </Text>
            
            {/* Colon and message content */}
            <Text style={{ color: contentColor }}>
              : {renderMessageContent(item.content)}
            </Text>
          </Text>
          
          {/* Display card image if available */}
          {item.image && (
            <Image
              source={{ uri: `${API_BASE_URL}${item.image}` }}
              style={styles.cardMessageImage}
              resizeMode="contain"
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderTabIndicator = () => {
    if (chatTabs.length <= 1) return null;

    return (
      <View style={styles.indicatorContainer}>
        {chatTabs.map((tab, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.indicator,
              index === activeTab && styles.activeIndicator,
              unreadCounts[tab.id] > 0 && index !== activeTab && styles.unreadIndicator
            ]}
            onPress={() => {
              setActiveTab(index);

              // Clear unread count for selected tab
              if (unreadCounts[tab.id]) {
                setUnreadCounts(prev => ({
                  ...prev,
                  [tab.id]: 0
                }));
              }
            }}
          />
        ))}
      </View>
    );
  };

  // Function to load emojis from the admin API and local assets
  const loadEmojis = async () => {
    try {
      // Local emoticons from assets/emoticon
      const localEmoticons = [
        { emoji: '😀', type: 'text', name: 'Grinning Face' },
        { emoji: '😂', type: 'text', name: 'Face with Tears of Joy' },
        { emoji: '🥰', type: 'text', name: 'Smiling Face with Hearts' },
        { emoji: '😊', type: 'text', name: 'Smiling Face with Smiling Eyes' },
        { emoji: '😍', type: 'text', name: 'Smiling Face with Heart-Eyes' },
        { emoji: '😘', type: 'text', name: 'Kiss' },
        { emoji: '😗', type: 'text', name: 'Kissing Face' },
        { emoji: '😙', type: 'text', name: 'Kissing Face with Smiling Eyes' },
        { emoji: '😚', type: 'text', name: 'Kissing Face with Closed Eyes' },
        { emoji: '🙂', type: 'text', name: 'Slightly Smiling Face' },
        { emoji: '🤗', type: 'text', name: 'Hugging Face' },
        { emoji: '🤩', type: 'text', name: 'Star-Struck' },
        { emoji: '🤔', type: 'text', name: 'Thinking Face' },
        { emoji: '🤨', type: 'text', name: 'Face with Raised Eyebrow' },
        { emoji: '😐', type: 'text', name: 'Neutral Face' },
        { emoji: '😑', type: 'text', name: 'Expressionless Face' },
        { emoji: '🙄', type: 'text', name: 'Face with Rolling Eyes' },
        { emoji: '😏', type: 'text', name: 'Smirking Face' },
        { emoji: '😣', type: 'text', name: 'Persevering Face' },
        { emoji: '😥', type: 'text', name: 'Sad but Relieved Face' },
        { emoji: '😮', type: 'text', name: 'Face with Open Mouth' },
        { emoji: '🤐', type: 'text', name: 'Zipper-Mouth Face' },
        { emoji: '😯', type: 'text', name: 'Hushed Face' },
        { emoji: '😪', type: 'text', name: 'Sleepy Face' },
        { emoji: '😫', type: 'text', name: 'Tired Face' },
        { emoji: '🥱', type: 'text', name: 'Yawning Face' },
        { emoji: '😴', type: 'text', name: 'Sleeping Face' },
        { emoji: '😌', type: 'text', name: 'Relieved Face' },
        { emoji: '😛', type: 'text', name: 'Face with Tongue' },
        { emoji: '😜', type: 'text', name: 'Winking Face with Tongue' },
        { emoji: '😝', type: 'text', name: 'Squinting Face with Tongue' },
        { emoji: '🤤', type: 'text', name: 'Drooling Face' },
        { emoji: '😒', type: 'text', name: 'Unamused Face' },
        { emoji: '😓', type: 'text', name: 'Downcast Face with Sweat' },
        { emoji: '😔', type: 'text', name: 'Pensive Face' },
        { emoji: '😕', type: 'text', name: 'Confused Face' },
        { emoji: '🙃', type: 'text', name: 'Upside-Down Face' },
        { emoji: '🤑', type: 'text', name: 'Money-Mouth Face' },
        { emoji: '😲', type: 'text', name: 'Astonished Face' },
        { emoji: '☹️', type: 'text', name: 'Frowning Face' },
        { emoji: '🙁', type: 'text', name: 'Slightly Frowning Face' },
        { emoji: '😖', type: 'text', name: 'Confounded Face' },
        { emoji: '😞', type: 'text', name: 'Disappointed Face' },
        { emoji: '😟', type: 'text', name: 'Worried Face' },
        { emoji: '😤', type: 'text', name: 'Face with Steam From Nose' },
        { emoji: '😢', type: 'text', name: 'Crying Face' },
        { emoji: '😭', type: 'text', name: 'Loudly Crying Face' },
        { emoji: '😦', type: 'text', name: 'Frowning Face with Open Mouth' },
        { emoji: '😧', type: 'text', name: 'Anguished Face' },
        { emoji: '😨', type: 'text', name: 'Fearful Face' },
        { emoji: '😩', type: 'text', name: 'Weary Face' },
        { emoji: '🤯', type: 'text', name: 'Exploding Head' },
        { emoji: '😬', type: 'text', name: 'Grimacing Face' },
        { emoji: '😰', type: 'text', name: 'Anxious Face with Sweat' },
        { emoji: '😱', type: 'text', name: 'Face Screaming in Fear' },
        { emoji: '🥵', type: 'text', name: 'Hot Face' },
        { emoji: '🥶', type: 'text', name: 'Cold Face' },
        { emoji: '😳', type: 'text', name: 'Flushed Face' },
        { emoji: '🤪', type: 'text', name: 'Zany Face' },
        { emoji: '😵', type: 'text', name: 'Dizzy Face' },
        { emoji: '🥴', type: 'text', name: 'Woozy Face' },
        { emoji: '😠', type: 'text', name: 'Angry Face' },
        { emoji: '😡', type: 'text', name: 'Pouting Face' },
        { emoji: '🤬', type: 'text', name: 'Face with Symbols on Mouth' },
        { emoji: '😷', type: 'text', name: 'Face with Medical Mask' },
        { emoji: '🤒', type: 'text', name: 'Face with Thermometer' },
        { emoji: '🤕', type: 'text', name: 'Face with Head-Bandage' },
        { emoji: '🤢', type: 'text', name: 'Nauseated Face' },
        { emoji: '🤮', type: 'text', name: 'Face Vomiting' },
        { emoji: '🤧', type: 'text', name: 'Sneezing Face' },
        { emoji: '😇', type: 'text', name: 'Smiling Face with Halo' },
        { emoji: '🤠', type: 'text', name: 'Cowboy Hat Face' },
        { emoji: '🥳', type: 'text', name: 'Partying Face' },
        { emoji: '🥺', type: 'text', name: 'Pleading Face' },
        { emoji: '🤡', type: 'text', name: 'Clown Face' },
        { emoji: '🤥', type: 'text', name: 'Lying Face' },
        { emoji: '🤫', type: 'text', name: 'Shushing Face' },
        { emoji: '🤭', type: 'text', name: 'Face with Hand Over Mouth' },
        { emoji: '😈', type: 'text', name: 'Smiling Face with Horns' },
        { emoji: '👿', type: 'text', name: 'Angry Face with Horns' },
        { emoji: '👹', type: 'text', name: 'Ogre' },
        { emoji: '👺', type: 'text', name: 'Goblin' },
        { emoji: '💀', type: 'text', name: 'Skull' },
        { emoji: '☠️', type: 'text', name: 'Skull and Crossbones' },
        { emoji: '👻', type: 'text', name: 'Ghost' },
        { emoji: '👽', type: 'text', name: 'Alien' },
        { emoji: '🤖', type: 'text', name: 'Robot' },
        // Add local emoticons from assets
        { url: require('../../assets/emoticon/angryold.png'), type: 'image', name: 'Angry Old' },
        { url: require('../../assets/emoticon/annoyedold.png'), type: 'image', name: 'Annoyed Old' },
        { url: require('../../assets/emoticon/bum.png'), type: 'image', name: 'Bum' },
        { url: require('../../assets/emoticon/callme.png'), type: 'image', name: 'Call Me' },
        { url: require('../../assets/emoticon/cheekyold.png'), type: 'image', name: 'Cheeky Old' },
        { url: require('../../assets/emoticon/confused.png'), type: 'image', name: 'Confused' },
        { url: require('../../assets/emoticon/coolold.png'), type: 'image', name: 'Cool Old' },
        { url: require('../../assets/emoticon/cry.png'), type: 'image', name: 'Cry' },
        { url: require('../../assets/emoticon/curiousold.png'), type: 'image', name: 'Curious Old' },
        { url: require('../../assets/emoticon/dies.png'), type: 'image', name: 'Dies' },
        { url: require('../../assets/emoticon/disgustold.png'), type: 'image', name: 'Disgust Old' },
        { url: require('../../assets/emoticon/dizzy.png'), type: 'image', name: 'Dizzy' },
        { url: require('../../assets/emoticon/drooling.png'), type: 'image', name: 'Drooling' },
        { url: require('../../assets/emoticon/err.png'), type: 'image', name: 'Err' },
        { url: require('../../assets/emoticon/ffootball.png'), type: 'image', name: 'Football' },
        { url: require('../../assets/emoticon/ffootballtrophy.png'), type: 'image', name: 'Football Trophy' },
        { url: require('../../assets/emoticon/fgoal.png'), type: 'image', name: 'Goal' },
        { url: require('../../assets/emoticon/fgoalpost.png'), type: 'image', name: 'Goal Post' },
        { url: require('../../assets/emoticon/fgoldenboot.png'), type: 'image', name: 'Golden Boot' },
        { url: require('../../assets/emoticon/fhat.png'), type: 'image', name: 'Hat' },
        { url: require('../../assets/emoticon/flirt.png'), type: 'image', name: 'Flirt' },
        { url: require('../../assets/emoticon/fmint.png'), type: 'image', name: 'Mint' },
        { url: require('../../assets/emoticon/fplayer.png'), type: 'image', name: 'Player' },
        { url: require('../../assets/emoticon/fredboot.png'), type: 'image', name: 'Red Boot' },
        { url: require('../../assets/emoticon/fredcard.png'), type: 'image', name: 'Red Card' },
        { url: require('../../assets/emoticon/fredjersey.png'), type: 'image', name: 'Red Jersey' },
        { url: require('../../assets/emoticon/fredpants.png'), type: 'image', name: 'Red Pants' },
        { url: require('../../assets/emoticon/freferee.png'), type: 'image', name: 'Referee' },
        { url: require('../../assets/emoticon/fring.png'), type: 'image', name: 'Ring' },
        { url: require('../../assets/emoticon/fscarf.png'), type: 'image', name: 'Scarf' },
        { url: require('../../assets/emoticon/fsilverball.png'), type: 'image', name: 'Silver Ball' },
        { url: require('../../assets/emoticon/fsoccertoy.png'), type: 'image', name: 'Soccer Toy' },
        { url: require('../../assets/emoticon/fsocks.png'), type: 'image', name: 'Socks' },
        { url: require('../../assets/emoticon/ftrophy.png'), type: 'image', name: 'Trophy' },
        { url: require('../../assets/emoticon/fwhistle.png'), type: 'image', name: 'Whistle' },
        { url: require('../../assets/emoticon/fwhistle2.png'), type: 'image', name: 'Whistle 2' },
        { url: require('../../assets/emoticon/fyellowcard.png'), type: 'image', name: 'Yellow Card' },
        { url: require('../../assets/emoticon/happy.png'), type: 'image', name: 'Happy' },
        { url: require('../../assets/emoticon/hugme.png'), type: 'image', name: 'Hug Me' },
        { url: require('../../assets/emoticon/hugme2.png'), type: 'image', name: 'Hug Me 2' },
        { url: require('../../assets/emoticon/hypnotized.png'), type: 'image', name: 'Hypnotized' },
        { url: require('../../assets/emoticon/insane.png'), type: 'image', name: 'Insane' },
        { url: require('../../assets/emoticon/kissback.png'), type: 'image', name: 'Kiss Back' },
        { url: require('../../assets/emoticon/kisslips.png'), type: 'image', name: 'Kiss Lips' },
        { url: require('../../assets/emoticon/kissme.png'), type: 'image', name: 'Kiss Me' },
        { url: require('../../assets/emoticon/kissold.png'), type: 'image', name: 'Kiss Old' },
        { url: require('../../assets/emoticon/love.png'), type: 'image', name: 'Love' },
        { url: require('../../assets/emoticon/nerd.png'), type: 'image', name: 'Nerd' },
        { url: require('../../assets/emoticon/sad.png'), type: 'image', name: 'Sad' },
        { url: require('../../assets/emoticon/shocked.png'), type: 'image', name: 'Shocked' },
        { url: require('../../assets/emoticon/shy.png'), type: 'image', name: 'Shy' },
        { url: require('../../assets/emoticon/shyold.png'), type: 'image', name: 'Shy Old' },
        { url: require('../../assets/emoticon/silent.png'), type: 'image', name: 'Silent' },
        { url: require('../../assets/emoticon/sleeping.png'), type: 'image', name: 'Sleeping' },
        { url: require('../../assets/emoticon/sleepy.png'), type: 'image', name: 'Sleepy' },
        { url: require('../../assets/emoticon/speechless.png'), type: 'image', name: 'Speechless' },
        { url: require('../../assets/emoticon/sssh.png'), type: 'image', name: 'Sssh' },
        { url: require('../../assets/emoticon/unimpressed.png'), type: 'image', name: 'Unimpressed' },
        { url: require('../../assets/emoticon/veryhappy.png'), type: 'image', name: 'Very Happy' },
        { url: require('../../assets/emoticon/wink.png'), type: 'image', name: 'Wink' },
        { url: require('../../assets/emoticon/yuck.png'), type: 'image', name: 'Yuck' },
        { url: require('../../assets/emoticon/yum.png'), type: 'image', name: 'Yum' },
      ];

      console.log('Loading emojis from:', `${API_BASE_URL}/emojis`);
      const response = await fetch(`${API_BASE_URL}/emojis`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      let serverEmojis = [];
      if (response.ok) {
        serverEmojis = await response.json();
        console.log('Server emojis loaded:', serverEmojis.length);
      } else {
        console.error('Failed to load server emojis');
      }

      // Combine local emoticons with server emojis
      const allEmojis = [...localEmoticons, ...serverEmojis];
      setEmojiList(allEmojis);
      console.log('Total emojis loaded:', allEmojis.length);
    } catch (error) {
      console.error('Error loading emojis:', error);
      // Fallback to just local emoticons if server fails
      const localEmoticons = [
        { emoji: '😀', type: 'text', name: 'Grinning Face' },
        { emoji: '😂', type: 'text', name: 'Face with Tears of Joy' },
        { emoji: '🥰', type: 'text', name: 'Smiling Face with Hearts' },
        { emoji: '😊', type: 'text', name: 'Smiling Face with Smiling Eyes' },
        { emoji: '😍', type: 'text', name: 'Smiling Face with Heart-Eyes' },
        // Add some local emoticons as fallback
        { url: require('../../assets/emoticon/happy.png'), type: 'image', name: 'Happy' },
        { url: require('../../assets/emoticon/sad.png'), type: 'image', name: 'Sad' },
        { url: require('../../assets/emoticon/wink.png'), type: 'image', name: 'Wink' },
        { url: require('../../assets/emoticon/love.png'), type: 'image', name: 'Love' },
        { url: require('../../assets/emoticon/cry.png'), type: 'image', name: 'Cry' },
      ];
      setEmojiList(localEmoticons);
    }
  };

  // Function to load gifts from the server API
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
                mappedGift.animation = videoMap[gift.animation];
                mappedGift.videoSource = videoMap[gift.animation];
              } else {
                // Keep original path if not in map
                mappedGift.animation = gift.animation;
              }
            } catch (error) {
              console.log('Video asset not found for:', gift.animation);
              mappedGift.animation = gift.animation;
            }
          }

          return mappedGift;
        });

        setGiftList(gifts);
      } else {
        console.error('Failed to load gifts from API, using fallback');
        // Simple fallback gifts if API fails
        const fallbackGifts = [
          { id: '1', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'static', category: 'popular' },
          { id: '2', name: 'Ionceng', icon: '🔔', price: 300, type: 'static', category: 'popular' },
          { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'static', category: 'lucky' },
        ];
        setGiftList(fallbackGifts);
      }
    } catch (error) {
      console.error('Error loading gifts:', error);
      // Simple fallback gifts on error
      const fallbackGifts = [
        { id: '1', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'static', category: 'popular' },
        { id: '2', name: 'Ionceng', icon: '🔔', price: 300, type: 'static', category: 'popular' },
        { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'static', category: 'lucky' },
      ];
      setGiftList(fallbackGifts);
    }
  };

  // Function to send gift to all users in room
  const handleGiftSendToAll = async (gift: any) => {
    if (!user || !user.balance || user.balance < gift.price * participants.length) {
      Alert.alert('Insufficient Coins', `You need ${(gift.price * participants.length).toLocaleString()} coins to send this gift to all users in the room.`);
      return;
    }

    const totalCost = gift.price * participants.length;
    Alert.alert(
      'Send Gift to All Users',
      `Send ${gift.name} ${gift.icon} to all ${participants.length} users in room for ${totalCost.toLocaleString()} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            participants.forEach(participant => {
              if (participant.username !== user.username) {
                // Send gift to each participant
                socket?.emit('sendGift', {
                  gift,
                  sender: user.username,
                  recipient: participant.username,
                  roomId: chatTabs[activeTab]?.id,
                  cost: gift.price,
                  timestamp: new Date().toISOString(),
                  isPrivate: false
                });
              }
            });
            setShowGiftPicker(false);
            setSendToAllUsers(false);
          }
        }
      ]
    );
  };

  // Function to send gift to room
  const handleGiftSend = async (gift: any, recipientUsername?: string) => {
    try {
      // Atomic check to prevent duplicate sends (ref-based for race condition protection)
      if (isSendingGiftRef.current) {
        console.log('Gift send already in progress, ignoring duplicate request');
        return;
      }

      if (!socket) {
        console.log('Socket not connected, cannot send gift');
        Alert.alert('Error', 'Connection lost. Please try again.');
        return;
      }

      // Set both ref (atomic) and state (for UI)
      isSendingGiftRef.current = true;
      setIsSendingGift(true);

      // Check balance first
      try {
        const response = await fetch(`${API_BASE_URL}/gifts/check-balance`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            giftPrice: gift.price
          }),
        });

        if (response.ok) {
          const balanceData = await response.json();

          if (!balanceData.canAfford) {
            isSendingGiftRef.current = false;
            setIsSendingGift(false);
            Alert.alert(
              'Saldo Tidak Cukup',
              `Anda memerlukan ${gift.price} coins untuk mengirim gift ini. Saldo Anda: ${balanceData.currentBalance} coins.`
            );
            return;
          }

          // Calculate recipient and system shares
          const isPrivateChat = chatTabs[activeTab]?.type === 'private';
          const recipientPercentage = isPrivateChat ? 0.3 : 0.7;
          const recipientShare = Math.floor(gift.price * recipientPercentage);
          const systemShare = gift.price - recipientShare;
          const remainingBalance = balanceData.currentBalance - gift.price;

          // Show cost breakdown confirmation
          const recipientText = recipientUsername ? `ke ${recipientUsername}` : 'ke room';
          const shareText = isPrivateChat ? '30%' : '70%';
          Alert.alert(
            'Konfirmasi Gift',
            `Kirim ${gift.name} ${recipientText}?\n\n` +
            `Total: ${gift.price} coins\n` +
            `${recipientUsername ? `${recipientUsername} mendapat: ${recipientShare} coins (${shareText})\n` : ''}` +
            `System cut: ${systemShare} coins\n` +
            `Sisa saldo: ${remainingBalance} coins`,
            [
              { 
                text: 'Batal', 
                style: 'cancel',
                onPress: () => {
                  isSendingGiftRef.current = false;
                  setIsSendingGift(false);
                }
              },
              {
                text: 'Kirim',
                onPress: async () => {
                  try {
                    // Process gift purchase through new endpoint
                    const purchaseResponse = await fetch(`${API_BASE_URL}/gift/purchase`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        giftId: gift.id,
                        giftPrice: gift.price,
                        recipientUsername: recipientUsername,
                        roomId: chatTabs[activeTab]?.id,
                        isPrivate: chatTabs[activeTab]?.type === 'private' || false
                      }),
                    });

                    if (purchaseResponse.ok) {
                      const purchaseData = await purchaseResponse.json();
                      console.log('Gift purchase successful:', purchaseData);

                      // Calculate system share and percentage
                      const recipientEarnings = purchaseData.earnings || 0;
                      const systemShare = gift.price - recipientEarnings;
                      const sharePercentage = gift.price > 0 ? Math.round((recipientEarnings / gift.price) * 100) : 0;

                      // Show success message
                      Alert.alert(
                        'Gift Sent!',
                        `${gift.name} berhasil dikirim ke ${recipientUsername}!\n\n` +
                        `Distribusi:\n` +
                        `• ${recipientUsername} mendapat: ${recipientEarnings} coins (${sharePercentage}%)\n` +
                        `• System: ${systemShare} coins\n\n` +
                        `Saldo Anda: ${purchaseData.newBalance} coins`
                      );

                      // Send gift via socket for real-time display
                      const giftData = {
                        roomId: chatTabs[activeTab]?.id,
                        sender: user?.username,
                        gift,
                        recipient: recipientUsername,
                        timestamp: new Date().toISOString(),
                        role: user?.role || 'user',
                        level: user?.level || 1
                      };

                      console.log('Sending gift via socket:', giftData);
                      socket.emit('sendGift', giftData);

                      setShowGiftPicker(false);
                      setSelectedGift(null);
                      // Close the user gift picker if it was open
                      if (showUserGiftPicker) {
                        setShowUserGiftPicker(false);
                        setSelectedGiftForUser(null);
                      }
                      isSendingGiftRef.current = false;
                      setIsSendingGift(false);

                    } else {
                      const errorData = await purchaseResponse.json();
                      isSendingGiftRef.current = false;
                      setIsSendingGift(false);
                      Alert.alert('Error', errorData.error || 'Gagal mengirim gift');
                    }

                  } catch (purchaseError) {
                    console.error('Error purchasing gift:', purchaseError);
                    isSendingGiftRef.current = false;
                    setIsSendingGift(false);
                    Alert.alert('Error', 'Gagal memproses pembelian gift');
                  }
                }
              }
            ],
            {
              cancelable: true,
              onDismiss: () => {
                isSendingGiftRef.current = false;
                setIsSendingGift(false);
              }
            }
          );

        } else {
          isSendingGiftRef.current = false;
          setIsSendingGift(false);
          Alert.alert('Error', 'Gagal memeriksa saldo. Silakan coba lagi.');
        }

      } catch (balanceError) {
        console.error('Error checking balance:', balanceError);
        isSendingGiftRef.current = false;
        setIsSendingGift(false);
        Alert.alert('Error', 'Gagal memeriksa saldo. Silakan coba lagi.');
      }

    } catch (error) {
      console.error('Error sending gift:', error);
      isSendingGiftRef.current = false;
      setIsSendingGift(false);
      Alert.alert('Error', 'Failed to send gift. Please try again.');
    }
  };

  // Function to send gift to specific user
  const handleGiftSendToUser = (gift: any) => {
    // Batch state updates to prevent useInsertionEffect error
    setTimeout(() => {
      setSelectedGiftForUser(gift);
      setShowGiftPicker(false);
      setShowUserGiftPicker(true);
    }, 0);
  };

  // Function to send gift to selected user
  const sendGiftToUser = async (targetUser: any) => {
    try {
      if (!user || !selectedGiftForUser || !targetUser) return;

      // Call the main handleGiftSend function with the recipient username
      handleGiftSend(selectedGiftForUser, targetUser.username);

      // No need to set activeGiftAnimation here, handleGiftSend will do it if successful

    } catch (error) {
      console.error('Error sending gift to user:', error);
      Alert.alert('Error', 'Failed to send gift to user');
    }
  };

  // Effect to load initial messages and participants when component mounts or roomId changes
  useEffect(() => {
    if (roomId) {
      loadParticipants();
    }
    loadEmojis(); // Load emojis when the component mounts or roomId changes
    loadGifts(); // Load gifts when the component mounts or roomId changes

    // Register background fetch for maintaining connection
    registerBackgroundFetch();

    return () => {
      // Cleanup background fetch when component unmounts
      unregisterBackgroundFetch();
    };
  }, [roomId]);


  if (!chatTabs.length) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Header with Gradient */}
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
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Chat</Text>
              <Text style={[styles.headerSubtitle, { color: '#e0f2f1' }]}>No active rooms</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Empty State */}
        <View style={styles.emptyStateContainer}>
          <Ionicons name="chatbubbles-outline" size={80} color="#ccc" />
          <Text style={styles.emptyStateTitle}>No Active Rooms</Text>
          <Text style={styles.emptyStateSubtitle}>Go back to join a room to start chatting</Text>
          <TouchableOpacity
            style={styles.joinRoomButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.joinRoomButtonText}>Browse Rooms</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={chatTabs[activeTab]?.type === 'private' ? ['#FF9800', '#FF5722'] : chatTabs[activeTab]?.isSupport ? ['#4CAF50', '#388E3C'] : ['#8B5CF6', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          {chatTabs[activeTab]?.type === 'private' ? (
            // Private Chat Header with Avatar
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
                  {targetUser?.username || chatTabs[activeTab]?.title.replace('Chat with ', '')}
                </Text>
                <Text style={styles.privateChatStatus}>Online</Text>
              </View>
            </View>
          ) : chatTabs[activeTab]?.isSupport ? (
            // Support Chat Header
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Support Chat</Text>
              <Text style={styles.headerSubtitle}>
                {isSocketConnected ? 'Connected' : 'Connecting...'}
              </Text>
            </View>
          ) : (
            // Regular Room Header
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: '#ffffff' }]}>{chatTabs[activeTab]?.title}</Text>
              <Text style={[styles.headerSubtitle, { color: '#e0f2f1' }]}>
                {chatTabs[activeTab]?.type === 'room' ? 'Chatroom' : 'Private Chat'} 
                {!isSocketConnected && ' • Reconnecting...'}
              </Text>
            </View>
          )}

          <View style={styles.headerIcons}>
            {chatTabs[activeTab]?.type === 'private' ? (
              // Private Chat Icons
              <>
                <TouchableOpacity style={styles.headerIcon} onPress={handleVideoCall}>
                  <Ionicons name="videocam-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleAudioCall}>
                  <Ionicons name="call-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            ) : chatTabs[activeTab]?.isSupport ? (
              // Support Chat Icons (e.g., options for support)
              <>
                <TouchableOpacity style={styles.headerIcon}>
                  <Ionicons name="help-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              // Room Chat Icons
              <>
                <TouchableOpacity style={styles.headerIcon} onPress={handleListPress}>
                  <Ionicons name="list-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        {renderTabIndicator()}

        {/* Connection Status Indicator */}
        <View style={styles.connectionStatusContainer}>
          <View style={[
            styles.connectionStatusDot,
            !isSocketConnected && styles.disconnectedDot,
            reconnectAttempts > 0 && isSocketConnected && styles.reconnectingDot
          ]} />
        </View>
      </LinearGradient>



      {/* Tab Navigation with KeyboardAvoidingView */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled={true}
      >
        <View style={styles.tabContainer}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={true}
            decelerationRate="fast"
            onMomentumScrollEnd={(event) => {
              const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
              if (newIndex !== activeTab && newIndex >= 0 && newIndex < chatTabs.length) {
                setActiveTab(newIndex);

                // Clear unread count for the new active tab
                const selectedRoomId = chatTabs[newIndex]?.id;
                if (selectedRoomId && unreadCounts[selectedRoomId]) {
                  setUnreadCounts(prev => ({
                    ...prev,
                    [selectedRoomId]: 0
                  }));
                }
              }
            }}
            scrollEventThrottle={16}
          >
            {chatTabs.map((tab, index) => (
              <TouchableWithoutFeedback key={`${tab.id}-${index}`} onPress={() => Keyboard.dismiss()}>
                <View style={styles.tabContent}>
                  <FlatList
                    ref={(ref) => { flatListRefs.current[tab.id] = ref; }} // Assign ref to the FlatList
                    data={tab.messages}
                    renderItem={renderMessage}
                    keyExtractor={(item, itemIndex) => `${item.id}-${itemIndex}`}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContainer}
                    scrollEnabled={true}
                    onScroll={({ nativeEvent }) => {
                      // Check if user is scrolling manually
                      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                      const isScrolledToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100; // Increased threshold
                      setIsUserScrolling(!isScrolledToBottom);
                    }}
                    onScrollBeginDrag={() => {
                      // User started scrolling manually
                      setIsUserScrolling(true);
                    }}
                    onMomentumScrollEnd={({ nativeEvent }) => {
                      // Check if user scrolled to bottom after momentum ends
                      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                      const isScrolledToBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;
                      setIsUserScrolling(!isScrolledToBottom);
                    }}
                    maintainVisibleContentPosition={{ minIndexForVisible: 0 }} // Optimization for FlatList
                  />
                </View>
              </TouchableWithoutFeedback>
            ))}
          </ScrollView>
          {/* Auto Scroll Toggle Button */}
          <TouchableOpacity
            style={styles.autoScrollButton}
            onPress={() => {
              setAutoScrollEnabled(!autoScrollEnabled);
              // If enabling autoscroll, immediately scroll to bottom
              if (!autoScrollEnabled && chatTabs[activeTab]) {
                const currentRoomId = chatTabs[activeTab].id;
                setTimeout(() => {
                  flatListRefs.current[currentRoomId]?.scrollToEnd({ animated: true });
                }, 100);
                setIsUserScrolling(false);
              }
            }}
          >
            <Ionicons
              name={autoScrollEnabled ? "arrow-down-circle" : "arrow-down-circle-outline"}
              size={30}
              color="white"
            />
          </TouchableOpacity>
        </View>

        {/* Message Input */}
        <View
          style={[
            styles.inputContainer,
            isKeyboardVisible && { paddingBottom: Platform.OS === 'android' ? 8 : 8 }
          ]}
        >
          {/* Emoji Preview Area */}
          {selectedImageEmojis.length > 0 && (
            <View style={styles.emojiPreviewContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiPreviewScroll}>
                {selectedImageEmojis.map((emoji) => (
                  <View key={emoji.uniqueId} style={styles.emojiPreviewItem}>
                    <Image
                      source={typeof emoji.url === 'number' ? emoji.url : { uri: `${API_BASE_URL}${emoji.url}` }}
                      style={styles.emojiPreviewImage}
                      resizeMode="contain"
                    />
                    <TouchableOpacity
                      style={styles.emojiPreviewRemoveButton}
                      onPress={() => handleRemoveImageEmoji(emoji.uniqueId)}
                    >
                      <Ionicons name="close-circle" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.emojiButton} onPress={handleEmojiPress}>
              <Ionicons name="happy-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.giftButton} onPress={() => {
              loadGifts();
              setShowGiftPicker(true);
            }}>
              <Ionicons name="gift-outline" size={24} color="#FF69B4" />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message"
              placeholderTextColor="#999"
              value={message}
              onChangeText={handleMessageChange}
              multiline
              blurOnSubmit={false}
              returnKeyType="default"
              onSubmitEditing={(event) => {
                if (!event.nativeEvent.text.trim()) {
                  return;
                }
                handleSendMessage();
              }}
              enablesReturnKeyAutomatically={true}
              maxLength={2000}
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Ionicons name="send" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Popup Menu Modal */}
      <Modal
        visible={showPopupMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPopupMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPopupMenu(false)}
        >
          <View style={styles.popupMenu}>
            {chatTabs[activeTab]?.type === 'private' ? (
              // Private Chat Menu Options
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    navigation.navigate('Profile', { userId: targetUser?.id || targetUser?.username });
                  }}
                >
                  <Ionicons name="person-outline" size={20} color="#333" />
                  <Text style={styles.menuText}>View Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    Alert.alert('Search Messages', 'Search functionality will be added soon');
                  }}
                >
                  <Ionicons name="search-outline" size={20} color="#333" />
                  <Text style={styles.menuText}>Search Messages</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    Alert.alert('Clear Chat', 'Clear chat functionality will be added soon');
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF9800" />
                  <Text style={[styles.menuText, { color: '#FF9800' }]}>Clear Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color="#F44336" />
                  <Text style={[styles.menuText, { color: '#F44336' }]}>Close Chat</Text>
                </TouchableOpacity>
              </>
            ) : chatTabs[activeTab]?.isSupport ? (
              // Support Chat Menu Options
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    Alert.alert('Support Options', 'More support options will be available soon.');
                  }}
                >
                  <Ionicons name="settings-outline" size={20} color="#333" />
                  <Text style={styles.menuText}>Support Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color="#F44336" />
                  <Text style={[styles.menuText, { color: '#F44336' }]}>End Support Session</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Room Chat Menu Options
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color="#F44336" />
                  <Text style={[styles.menuText, { color: '#F44336' }]}>Leave Room</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleRoomInfo}
                >
                  <Ionicons name="information-circle-outline" size={20} color="#333" />
                  <Text style={styles.menuText}>Info Room</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Room Info Modal */}
      <Modal
        visible={showRoomInfo}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRoomInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.roomInfoModal}>
            <View style={styles.roomInfoHeader}>
              <Text style={styles.roomInfoTitle}>Room Information</Text>
              <TouchableOpacity onPress={() => setShowRoomInfo(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.roomInfoContent}>
              <View style={styles.roomInfoItem}>
                <Ionicons name="home-outline" size={20} color="#666" />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Room Name</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.title}</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="calendar-outline" size={20} color="#666" />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Created Date</Text>
                  <Text style={styles.roomInfoValue}>18 August 2025</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="person-outline" size={20} color="#666" />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Owner</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.managedBy || 'admin'}</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="shield-outline" size={20} color="#666" />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Moderator</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.managedBy || 'admin'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Participants List Modal */}
      <Modal
        visible={showParticipants}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowParticipants(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.participantsModal}>
            <View style={styles.participantsHeader}>
              <Text style={styles.participantsTitle}>Room Participants</Text>
              <TouchableOpacity onPress={() => setShowParticipants(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.participantsList}>
              {participants.length > 0 ? (
                participants.map((participant, index) => (
                  <TouchableOpacity
                    key={`${participant.username}-${participant.id || index}`}
                    style={[
                      styles.participantItem,
                      { backgroundColor: getRoleBackgroundColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                    ]}
                    onPress={() => handleParticipantPress(participant)}
                  >
                    <View style={[
                      styles.participantAvatar,
                      { backgroundColor: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                    ]}>
                      <Text style={styles.participantAvatarText}>
                        {participant.username ? participant.username.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <View style={styles.participantInfo}>
                      <Text style={[
                        styles.participantName,
                        { color: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                      ]}>
                        {participant.username || 'Unknown User'}
                      </Text>
                      <View style={styles.participantRoleContainer}>
                        <Text style={[
                          styles.participantRole,
                          { color: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                        ]}>
                          {(() => {
                            const currentRoom = chatTabs[activeTab];
                            const isOwner = currentRoom && currentRoom.managedBy === participant.username;
                            const isModerator = currentRoom && currentRoom.moderators && currentRoom.moderators.includes(participant.username);

                            if (isOwner) return '👤 Owner';
                            if (isModerator) return '🛡️ Moderator';

                            switch (participant.role) {
                              case 'admin': return '👑 Admin';
                              case 'merchant': return '🏪 Merchant';
                              case 'mentor': return '🎓 Mentor';
                              default: return '👤 User';
                            }
                          })()}
                        </Text>
                        {mutedUsers.includes(participant.username) && (
                          <Text style={styles.mutedIndicator}>🔇 Muted</Text>
                        )}
                        {blockedUsers.includes(participant.username) && (
                          <Text style={styles.blockedIndicator}>🚫 Blocked</Text>
                        )}
                      </View>
                    </View>
                    <View style={[
                      styles.participantStatus,
                      { backgroundColor: participant.isOnline ? '#4CAF50' : '#9E9E9E' }
                    ]}>
                      <Text style={styles.participantStatusText}>
                        {participant.isOnline ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noParticipants}>
                  <Text style={styles.noParticipantsText}>No participants found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Participant Context Menu Modal */}
      <Modal
        visible={showParticipantMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowParticipantMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowParticipantMenu(false)}
        >
          <View style={styles.participantContextMenu}>
            <View style={styles.participantMenuHeader}>
              <View style={styles.participantMenuAvatar}>
                <Text style={styles.participantMenuAvatarText}>
                  {selectedParticipant?.username ? selectedParticipant.username.charAt(0).toUpperCase() : 'U'}
                </Text>
              </View>
              <Text style={styles.participantMenuName}>{selectedParticipant?.username}</Text>
            </View>

            <TouchableOpacity
              style={styles.participantMenuItem}
              onPress={handleViewProfile}
            >
              <Ionicons name="person-outline" size={20} color="#333" />
              <Text style={styles.participantMenuText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.participantMenuItem}
              onPress={handleOpenChat}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#333" />
              <Text style={styles.participantMenuText}>Private Chat</Text>
            </TouchableOpacity>

            {(user?.role === 'admin' || user?.role === 'mentor') && (
              <TouchableOpacity
                style={styles.participantMenuItem}
                onPress={handleKickUser}
              >
                <Ionicons name="exit-outline" size={20} color="#F44336" />
                <Text style={[styles.participantMenuText, { color: '#F44336' }]}>Kick User</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.participantMenuItem}
              onPress={handleBlockUser}
            >
              <Ionicons name="ban-outline" size={20} color="#FF9800" />
              <Text style={[styles.participantMenuText, { color: '#FF9800' }]}>
                {blockedUsers.includes(selectedParticipant?.username) ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>

            {user?.role === 'admin' && (
              <TouchableOpacity
                style={styles.participantMenuItem}
                onPress={handleMuteUser}
              >
                <Ionicons name="volume-mute-outline" size={20} color="#9C27B0" />
                <Text style={[styles.participantMenuText, { color: '#9C27B0' }]}>
                  {mutedUsers.includes(selectedParticipant?.username) ? 'Unmute User' : 'Mute User'}
                </Text>
              </TouchableOpacity>
            )}

            {(isRoomOwner() || isRoomModerator() || user?.role === 'admin') && (
              <>
                <TouchableOpacity
                  style={styles.participantMenuItem}
                  onPress={handleBanUser}
                >
                  <Ionicons name="remove-circle-outline" size={20} color="#E91E63" />
                  <Text style={[styles.participantMenuText, { color: '#E91E63' }]}>
                    {bannedUsers.includes(selectedParticipant?.username) ? 'Unban User' : 'Ban User'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.participantMenuItem}
                  onPress={handleLockRoom}
                >
                  <Ionicons name="lock-closed-outline" size={20} color="#FF5722" />
                  <Text style={[styles.participantMenuText, { color: '#FF5722' }]}>Lock Room</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.participantMenuItem, styles.lastParticipantMenuItem]}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color="#F44336" />
              <Text style={[styles.participantMenuText, { color: '#F44336' }]}>Report User</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                <Text style={styles.emojiPickerTitle}>Select Emoji ✕</Text>
              </View>

              <View style={styles.emojiPickerContent}>
                {emojiList.length > 0 ? (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={styles.emojiScrollView}
                    contentContainerStyle={styles.emojiScrollContent}
                  >
                    {emojiList.map((emoji, index) => (
                      <TouchableOpacity
                        key={`${emoji.name || emoji.emoji}-${index}`}
                        style={styles.emojiItem}
                        onPress={() => handleEmojiSelect(emoji)}
                      >
                        {emoji.type === 'text' ? (
                          <Text style={styles.emojiText}>{emoji.emoji}</Text>
                        ) : emoji.type === 'image' && typeof emoji.url === 'string' ? (
                          <Image source={{ uri: `${API_BASE_URL}${emoji.url}` }} style={styles.emojiImage} />
                        ) : emoji.type === 'image' && typeof emoji.url === 'number' ? (
                          <Image source={emoji.url} style={styles.emojiImage} />
                        ) : (
                          <Text style={styles.emojiText}>🙂</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.emptyEmojiContainer}>
                    <Ionicons name="cloud-upload-outline" size={40} color="#ccc" />
                    <Text style={styles.emptyEmojiTitle}>No Emojis Available</Text>
                    <Text style={styles.emptyEmojiSubtitle}>
                      Add emojis via the Admin Panel to make them available here.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Picker Modal */}
      <Modal
        visible={showGiftPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowGiftPicker(false)}
      >
        <View style={styles.giftModalOverlay}>
          <View style={styles.giftPickerModal}>
            <View style={styles.giftPickerHeader}>
              <Text style={styles.giftPickerTitle}>Send Gift 🎁</Text>
              <TouchableOpacity onPress={() => setShowGiftPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Gift Category Tabs */}
            <View style={styles.giftCategoryTabs}>
              <View style={styles.tabRow}>
                <TouchableOpacity 
                  style={[styles.categoryTab, activeGiftTab === 'all' && styles.activeCategoryTab]}
                  onPress={() => setActiveGiftTab('all')}
                >
                  <Text style={[styles.categoryTabText, activeGiftTab === 'all' && styles.activeCategoryTabText]}>Semua hadiah</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.categoryTab, activeGiftTab === 'special' && styles.activeCategoryTab]}
                  onPress={() => setActiveGiftTab('special')}
                >
                  <Text style={[styles.categoryTabText, activeGiftTab === 'special' && styles.activeCategoryTabText]}>Hadiah Ketertarikan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Send to All Toggle */}
            <View style={styles.sendToAllContainer}>
              <TouchableOpacity 
                style={styles.sendToAllToggle}
                onPress={() => setSendToAllUsers(!sendToAllUsers)}
              >
                <Ionicons 
                  name={sendToAllUsers ? "checkbox" : "square-outline"} 
                  size={20} 
                  color={sendToAllUsers ? "#4ADE80" : "#666"} 
                />
                <Text style={styles.sendToAllText}>Kirim ke semua user di room</Text>
              </TouchableOpacity>
            </View>

            {/* Coin Balance Display */}
            <View style={styles.coinBalanceDisplay}>
              <View style={styles.coinBalanceRow}>
                <Ionicons name="diamond" size={20} color="#FFD700" />
                <Text style={styles.coinBalanceText}>Balance: {user?.balance || 0} coins</Text>
              </View>
            </View>

            <FlatList
              data={activeGiftTab === 'all' ? giftList : giftList.filter(gift => gift.category === 'special' || gift.special)}
              renderItem={({ item: gift, index }) => (
                <View style={styles.newGiftItemContainer}>
                  <TouchableOpacity
                    style={styles.newGiftItem}
                    onPress={() => sendToAllUsers ? handleGiftSendToAll(gift) : handleGiftSend(gift)}
                  >
                    <View style={styles.newGiftIconContainer}>
                      {gift.image ? (
                        <Image 
                          source={typeof gift.image === 'string' ? { uri: gift.image } : gift.image} 
                          style={styles.giftImage} 
                          resizeMode="contain"
                        />
                      ) : gift.animation ? (
                        // Check if it's MP4 video
                        (typeof gift.animation === 'string' && gift.animation.toLowerCase().includes('.mp4')) ||
                        (gift.name && (gift.name.toLowerCase().includes('love') || gift.name.toLowerCase().includes('ufo'))) ? (
                          <Video
                            source={typeof gift.animation === 'string' ? { uri: gift.animation } : gift.animation}
                            style={styles.giftImage}
                            resizeMode="contain"
                            shouldPlay={false}
                            isLooping={false}
                            isMuted={true}
                          />
                        ) : (
                          // For GIF animations
                          <Image 
                            source={typeof gift.animation === 'string' ? { uri: gift.animation } : gift.animation} 
                            style={styles.giftImage} 
                            resizeMode="contain"
                          />
                        )
                      ) : (
                        <Text style={styles.newGiftIcon}>{gift.icon}</Text>
                      )}
                      {gift.type === 'animated' && (
                        <View style={styles.animatedBadge}>
                          <Text style={styles.animatedBadgeText}>✨</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.newGiftName}>{gift.name}</Text>
                    <View style={styles.giftPriceContainer}>
                      <Ionicons name="diamond-outline" size={12} color="#FFD700" />
                      <Text style={styles.newGiftPrice}>{gift.price}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.giftActionButtons}>
                    <TouchableOpacity
                      style={styles.sendToUserButton}
                      onPress={() => handleGiftSendToUser(gift)}
                    >
                      <Text style={styles.giftActionText}>User</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              numColumns={2}
              keyExtractor={(gift, index) => `${gift.id}-${index}`}
              contentContainerStyle={styles.giftGridContainer}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* User Gift Picker Modal */}
      <Modal
        visible={showUserGiftPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUserGiftPicker(false)}
      >
        <View style={styles.giftModalOverlay}>
          <View style={styles.userGiftPickerModal}>
            <View style={styles.giftPickerHeader}>
              <Text style={styles.giftPickerTitle}>
                Send {selectedGiftForUser?.name} {selectedGiftForUser?.icon} to User
              </Text>
              <TouchableOpacity onPress={() => setShowUserGiftPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.userListContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Select User:</Text>
              {participants.map((participant, index) => (
                <TouchableOpacity
                  key={`gift-${participant.username}-${participant.id || index}`}
                  style={styles.userGiftItem}
                  onPress={() => sendGiftToUser(participant)}
                  disabled={participant.username === user?.username}
                >
                  <View style={[
                    styles.participantAvatar,
                    { backgroundColor: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                  ]}>
                    <Text style={styles.participantAvatarText}>
                      {participant.username ? participant.username.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                  <View style={styles.userGiftInfo}>
                    <Text style={[
                      styles.userGiftName,
                      { color: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                    ]}>
                      {participant.username || 'Unknown User'}
                    </Text>
                    <Text style={styles.userGiftRole}>
                      {(() => {
                        const currentRoom = chatTabs[activeTab];
                        const isOwner = currentRoom && currentRoom.managedBy === participant.username;

                        if (isOwner) return '👤 Owner';

                        switch (participant.role) {
                          case 'admin': return '👑 Admin';
                          case 'merchant': return '🏪 Merchant';
                          case 'mentor': return '🎓 Mentor';
                          default: return '👤 User';
                        }
                      })()}
                    </Text>
                  </View>
                  {participant.username === user?.username && (
                    <Text style={styles.selfLabel}>(You)</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Tag Menu Modal */}
      <Modal
        visible={showUserTagMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUserTagMenu(false)}
      >
        <TouchableOpacity
          style={styles.userTagModalOverlay}
          activeOpacity={1}
          onPress={() => setShowUserTagMenu(false)}
        >
          <View style={styles.userTagMenu}>
            <View style={styles.userTagHeader}>
              <Text style={styles.userTagTitle}>Select User to Tag</Text>
            </View>
            <ScrollView style={styles.userTagList} showsVerticalScrollIndicator={false}>
              {filteredParticipants.map((participant, index) => (
                <TouchableOpacity
                  key={`tag-${participant.username}-${participant.id || index}`}
                  style={styles.userTagItem}
                  onPress={() => handleUserTag(participant.username)}
                >
                  <View style={[
                    styles.participantAvatar,
                    { backgroundColor: getRoleColor(participant.role, participant.username, chatTabs[activeTab]?.id) }
                  ]}>
                    <Text style={styles.participantAvatarText}>
                      {participant.username ? participant.username.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                  <View style={styles.userTagInfo}>
                    <Text style={styles.userTagName}>@{participant.username}</Text>
                    <Text style={styles.userTagRole}>
                      {(() => {
                        const currentRoom = chatTabs[activeTab];
                        const isOwner = currentRoom && currentRoom.managedBy === participant.username;

                        if (isOwner) return '👤 Owner';

                        switch (participant.role) {
                          case 'admin': return '👑 Admin';
                          case 'merchant': return '🏪 Merchant';
                          case 'mentor': return '🎓 Mentor';
                          default: return '👤 User';
                        }
                      })()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Message Context Menu Modal */}
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
            <View style={styles.messageMenuHeader}>
              <Text style={styles.messageMenuTitle}>Message Options</Text>
            </View>

            <TouchableOpacity
              style={styles.messageMenuItem}
              onPress={handleCopyMessage}
            >
              <Ionicons name="copy-outline" size={20} color="#333" />
              <Text style={styles.messageMenuText}>Copy Message</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.messageMenuItem}
              onPress={() => {
                if (selectedMessage) {
                  setMessage(`@${selectedMessage.sender} `);
                }
                setShowMessageMenu(false);
                setSelectedMessage(null);
              }}
            >
              <Ionicons name="at-outline" size={20} color="#333" />
              <Text style={styles.messageMenuText}>Reply to User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.messageMenuItem, styles.lastMessageMenuItem]}
              onPress={() => {
                setShowMessageMenu(false);
                setSelectedMessage(null);
              }}
            >
              <Ionicons name="close-outline" size={20} color="#666" />
              <Text style={[styles.messageMenuText, { color: '#666' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Gift Animation Overlay - Live Streaming Style */}
      {activeGiftAnimation && (
        <View style={styles.giftAnimationOverlay} pointerEvents="box-none">
          {/* Full Screen Video/Animation Layer */}
          <Animated.View 
            style={[
              styles.fullScreenAnimationContainer,
              {
                opacity: giftOpacityAnim,
                transform: [{ scale: giftScaleAnim }]
              }
            ]}
            pointerEvents="box-none"
          >
            {/* Full Screen MP4 Video Effect */}
            {activeGiftAnimation.animation && (
              (typeof activeGiftAnimation.animation === 'string' && activeGiftAnimation.animation.toLowerCase().includes('.mp4')) ||
              (activeGiftAnimation.name && (activeGiftAnimation.name.toLowerCase().includes('love') || activeGiftAnimation.name.toLowerCase().includes('ufo')))
            ) && (
              <Video
                ref={giftVideoRef}
                source={typeof activeGiftAnimation.animation === 'string' ? { uri: activeGiftAnimation.animation } : activeGiftAnimation.animation}
                style={styles.fullScreenVideo}
                resizeMode="cover"
                shouldPlay
                isLooping={false}
                isMuted={false}
                volume={0.7}
                onPlaybackStatusUpdate={(status) => {
                  // Auto close after video ends with smooth fade out
                  if (status.didJustFinish) {
                    setTimeout(() => {
                      Animated.parallel([
                        Animated.timing(giftScaleAnim, {
                          toValue: 1.1, // Slight zoom out effect
                          duration: 500,
                          useNativeDriver: true,
                        }),
                        Animated.timing(giftOpacityAnim, {
                          toValue: 0,
                          duration: 500,
                          useNativeDriver: true,
                        }),
                      ]).start(() => {
                        setActiveGiftAnimation(null);
                      });
                    }, 1500); // Wait 1.5 seconds after video ends
                  }
                }}
              />
            )}

            {/* Small Static Image/GIF Effect (30x30) */}
            {activeGiftAnimation.image && (
              <View style={styles.smallGiftContainer}>
                <Image 
                  source={typeof activeGiftAnimation.image === 'string' ? { uri: activeGiftAnimation.image } : activeGiftAnimation.image} 
                  style={styles.smallGiftImage}
                  resizeMode="contain"
                />
              </View>
            )}

            {/* Fullscreen GIF layer for non-MP4 animations with transparency */}
            {activeGiftAnimation.animation && 
             !(typeof activeGiftAnimation.animation === 'string' && activeGiftAnimation.animation.toLowerCase().includes('.mp4')) &&
             !(activeGiftAnimation.name && (activeGiftAnimation.name.toLowerCase().includes('love') || activeGiftAnimation.name.toLowerCase().includes('ufo'))) && (
              <Image 
                source={typeof activeGiftAnimation.animation === 'string' ? { uri: activeGiftAnimation.animation } : activeGiftAnimation.animation} 
                style={styles.fullScreenGif}
                resizeMode="cover"
              />
            )}

            {/* Fallback emoji/icon layer (small) */}
            {!activeGiftAnimation.animation && !activeGiftAnimation.image && (
              <View style={styles.smallGiftContainer}>
                <Text style={styles.smallGiftEmoji}>{activeGiftAnimation.icon}</Text>
              </View>
            )}
          </Animated.View>

          {/* Gift Info Overlay - Bottom */}
          <Animated.View 
            style={[
              styles.giftInfoOverlay,
              {
                opacity: giftOpacityAnim,
                transform: [{ translateY: giftScaleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0]
                })}]
              }
            ]}
          >
            <Text style={styles.giftSenderName}>
              {activeGiftAnimation.sender}
            </Text>
            <Text style={styles.giftDescription}>
              sent {activeGiftAnimation.name} {activeGiftAnimation.icon}
              {activeGiftAnimation.recipient && ` to ${activeGiftAnimation.recipient}`}
            </Text>
          </Animated.View>


        </View>
      )}

      {/* Call Modal */}
      <Modal
        visible={showCallModal}
        transparent={false}
        animationType="slide"
        onRequestClose={endCall}
      >
        <View style={styles.callModalContainer}>
          <View style={styles.callHeader}>
            <Text style={styles.callHeaderText}>
              {callType === 'video' ? 'Video Call' : 'Audio Call'}
            </Text>
            <Text style={styles.callTargetName}>
              {targetUser?.username}
            </Text>
            <Text style={styles.callTimer}>
              {formatCallTime(callTimer)}
            </Text>
            <Text style={styles.callCost}>
              Cost: {callCost} coins
            </Text>
          </View>

          <View style={styles.videoCallContainer}>
            {isInCall && (
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                <Text style={{ color: 'white', textAlign: 'center', marginTop: 50 }}>
                  Call Active with {targetUser?.username}
                </Text>
                <Text style={{ color: 'white', textAlign: 'center', marginTop: 10 }}>
                  {Math.floor(callTimer / 60)}:{(callTimer % 60).toString().padStart(2, '0')}
                </Text>
                <Text style={{ color: '#FFD700', textAlign: 'center', marginTop: 5 }}>
                  Cost: {callCost} coins
                </Text>
                {/* Daily.co video implementation will be added here */}
              </View>
            )}
          </View>

          <View style={styles.callControls}>
            <TouchableOpacity 
              style={[styles.callButton, styles.endCallButton]} 
              onPress={endCall}
            >
              <Ionicons name="call" size={30} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Incoming Call Modal */}
      <Modal
        visible={showIncomingCallModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDeclineCall}
      >
        <View style={styles.incomingCallOverlay}>
          <View style={styles.incomingCallModal}>
            <View style={styles.incomingCallHeader}>
              <Text style={styles.incomingCallTitle}>
                {incomingCallData?.callType === 'video' ? 'Video' : 'Audio'} Call
              </Text>
              <Text style={styles.incomingCallSubtitle}>Incoming call from</Text>
              <Text style={styles.callerName}>{incomingCallData?.callerName}</Text>
            </View>

            <View style={styles.callerAvatar}>
              <Text style={styles.callerAvatarText}>
                {incomingCallData?.callerName?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>

            <View style={styles.callRateInfo}>
              <Text style={styles.callRateText}>Call Rates:</Text>
              <Text style={styles.callRateDetail}>• First minute: 2,500 coins</Text>
              <Text style={styles.callRateDetail}>• After 1st minute: 2,000 coins/minute</Text>
            </View>

            <View style={styles.incomingCallButtons}>
              <TouchableOpacity 
                style={[styles.callActionButton, styles.declineButton]} 
                onPress={handleDeclineCall}
              >
                <Ionicons name="call" size={30} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.callActionText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.callActionButton, styles.acceptButton]} 
                onPress={handleAcceptCall}
              >
                <Ionicons name="call" size={30} color="white" />
                <Text style={styles.callActionText}>Accept</Text>
              </TouchableOpacity>
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
    backgroundColor: '#ffffff',
  },
  '@keyframes blink': {
    '0%, 50%': { opacity: 1 },
    '51%, 100%': { opacity: 0.5 },
  },
  chatContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  privateChatHistory: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  privateChatSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  emptyPrivateChats: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyPrivateChatsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
  },
  emptyPrivateChatsSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
  actionSection: {
    padding: 20,
    paddingTop: 0,
  },
  header: {
    paddingTop: 25,
    paddingBottom: 15,
    paddingHorizontal: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  privateChatHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  privateChatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  defaultAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  },
  privateChatStatus: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    padding: 8,
    marginLeft: 4,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(51, 51, 51, 0.4)',
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: '#229c93',
  },
  unreadIndicator: {
    backgroundColor: '#FF6B35',
  },
  tabNavigation: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    maxHeight: 50,
  },
  tabNavigationContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tabNavItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius:    20,
    backgroundColor: '#F5F5F5',
  },
  activeTabNavItem: {
    backgroundColor: '#229c93',
  },
  tabNavText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabNavText: {
    color: '#fff',
  },
  roomDescriptionContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  roomDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  managedByText: {
    fontSize: 13,
    color: '#888',
  },
  roomNameHighlight: {
    color: '#d6510f',
    fontWeight: 'bold',
  },
  currentlyInRoomContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  currentlyInRoomText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  currentlyText: {
    fontSize: 13,
    color: '#666',
  },
  participantInRoomName: {
    fontSize: 13,
    fontWeight: '600',
  },
  participantSeparator: {
    fontSize: 13,
    color: '#666',
  },
  noParticipantsInRoom: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  tabContainer: {
    flex: 1,
  },
  tabContent: {
    width: width,
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageContainer: {
    marginBottom: 2,
    paddingHorizontal: 0,
  },
  supportMessageContainer: {
    marginBottom: 6,
    paddingHorizontal: 0,
  },
  supportMessageBubble: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    borderRadius: 8,
    padding: 8,
  },
  botCommandContainer: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#167027',
    borderRadius: 8,
    marginVertical: 2,
  },
  systemCommandContainer: {
    backgroundColor: '#F5F5F5',
    borderLeftWidth: 3,
    borderLeftColor: '#8B4513',
    borderRadius: 8,
    marginVertical: 2,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  messageContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    textAlignVertical: 'top',
    marginLeft: 6,
  },
  levelText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  roleBadge: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginRight: 4,
    minWidth: 20,
    alignItems: 'center',
  },
  roleBadgeText: {
    fontSize: 12,
    color: 'white',
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 6,
    alignSelf: 'flex-start',
  },
  messageContent: {
    fontSize: 14,
    color: '#333',
  },
  inlineEmojiImage: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  giftImageInChat: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  botMessageWithCard: {
    flex: 1,
  },
  cardImage: {
    width: 16,
    height: 20,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  messageTextContainer: {
    flex: 1,
    marginLeft: 6,
  },
  cardMessageImage: {
    width: 20,
    height: 25,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignSelf: 'flex-start',
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
  emojiPreviewContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    maxHeight: 60,
  },
  emojiPreviewScroll: {
    flexDirection: 'row',
  },
  emojiPreviewItem: {
    position: 'relative',
    marginRight: 8,
    padding: 4,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  emojiPreviewImage: {
    width: 32,
    height: 32,
  },
  emojiPreviewRemoveButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF5252',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupMenu: {
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  roomInfoModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  roomInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  roomInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  roomInfoContent: {
    padding: 20,
  },
  roomInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  roomInfoText: {
    marginLeft: 12,
    flex: 1,
  },
  roomInfoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  roomInfoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  participantsModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },  participantsList: {
    maxHeight: 400,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#229c93',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  participantAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  participantRole: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  participantStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  participantStatusText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  noParticipants: {
    padding: 40,
    alignItems: 'center',
  },
  noParticipantsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Emoji Picker Styles
  emojiModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  emojiPickerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Position above input area
  },
  emojiPickerModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
  emojiPickerContent: {
    maxHeight: 200, // Increased height for vertical scrolling
    minHeight: 140,
  },
  emojiScrollView: {
    flex: 1,
  },
  emojiScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emojiItem: {
    width: 40,
    height: 40,
    margin: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  emojiText: {
    fontSize: 18,
  },
  emojiImage: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  emptyEmojiContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  emptyEmojiTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyEmojiSubtitle: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
  },
  joinRoomButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
  },
  joinRoomButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Participant context menu styles
  participantContextMenu: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    minWidth: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  participantMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  participantMenuAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#229c93',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantMenuAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  participantMenuName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  participantMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  lastParticipantMenuItem: {
    borderBottomWidth: 0,
  },
  participantMenuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  // Status indicators in participant list
  participantRoleContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  mutedIndicator: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '500',
    marginTop: 2,
  },
  blockedIndicator: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '500',
    marginTop: 2,
  },
  // Join/Leave message styles
  joinLeaveMessageContainer: {
    marginVertical: 2,
    paddingHorizontal: 0,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  joinLeaveMessageText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    textAlign: 'left',
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomNameText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  usernameText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // roleBadgeText is defined above
  actionText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  joinLeaveTime: {
    fontSize: 11,
    color: '#999',
    fontWeight: '400',
  },
  commandMessageContainer: {
    marginBottom: 6,
    paddingHorizontal: 0,
    alignSelf: 'flex-start',
  },
  commandMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  commandMessageText: {
    flex: 1,
    fontSize: 14,
    color: '#8B4513', // Warna coklat untuk command
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  commandContentText: {
    fontSize: 14,
    color: '#8B4513', // Warna coklat untuk content
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
  unreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Gift Picker Styles
  giftModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  giftPickerModal: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    paddingBottom: 20,
  },
  giftPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  giftPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  giftCategoryTabs: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  sendToAllContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  sendToAllToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendToAllText: {
    fontSize: 14,
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginRight: 16,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  activeCategoryTab: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: '#FF8C00',
    borderRadius: 0,
  },
  categoryTabText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '500',
  },
  activeCategoryTabText: {
    color: '#FF8C00',
    fontWeight: 'bold',
  },
  coinBalanceContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  coinBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  coinIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  coinText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  coinDescription: {
    fontSize: 14,
    color: '#888',
  },
  giftPickerContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  newGiftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
  },
  newGiftItemContainer: {
    flex: 0.5,
    marginHorizontal: 5,
    marginBottom: 15,
  },
  newGiftItem: {
    backgroundColor: '#3C3C3E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    minHeight: 140,
  },
  selectedGiftItem: {
    borderColor: '#FF8C00',
    backgroundColor: '#4A3C2A',
  },
  giftCoinIndicators: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  topLeftCoin: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightCoin: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomLeftCoin: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomRightCoin: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#4ADE80',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coinIndicatorText: {
    fontSize: 12,
  },
  coinMultiplier: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  newGiftIconContainer: {
    marginTop: 16,
    marginBottom: 12,
    zIndex: 2,
  },
  giftImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  newGiftIcon: {
    fontSize: 48,
  },
  newGiftName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  newGiftPrice: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 4,
  },
  giftGridContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlign: 'center',
  },
  newGiftPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinPriceIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  newGiftPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  // Legacy styles for backward compatibility
  giftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
  },
  giftItemContainer: {
    width: '30%',
    height: 30,
    marginBottom: 16,
  },
  giftItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    flex: 1,
    minHeight: 140,
  },
  giftActionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
  },
  sendToRoomButton: {
    flex: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendToUserButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 105, 180, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  giftActionText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    fontWeight: '600',
  },
  giftIconContainer: {
    position: 'relative',
    marginBottom: 8,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftIcon: {
    fontSize: 40,
  },
  animatedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF69B4',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedBadgeText: {
    fontSize: 10,
    color: 'white',
  },
  giftName: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
    textAlign: 'center',
    minHeight: 28,
    lineHeight: 14,
  },
  giftPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  giftPrice: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 2,
  },
  giftPreviewImage: {
    width: 60,
    height: 70,
    borderRadius: 8,
    resizeMode: 'contain',
  },
  // Auto scroll button styles
  autoScrollButton: {
    position: 'absolute',
    bottom: 120, // Adjusted position to be above the input field
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 10,
  },
  // Styles for userGiftRole, etc.
  userGiftRole: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  // Added styles for private chat history display when no rooms are active
  userListContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  userGiftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  userGiftInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userGiftName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  selfLabel: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
  },
  // Live Streaming Style Gift Animation Overlay
  giftAnimationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent', // Fully transparent background
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
  fullScreenVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    opacity: 0.6, // More transparent for smoother look
  },
  smallGiftContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -70,
    width: 120,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  smallGiftImage: {
    width: 120,
    height: 140,
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
    backdropFilter: 'blur(5px)',
    zIndex: 1002,
  },
  giftSenderName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  giftDescription: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  fullScreenGif: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    opacity: 0.5, // Semi transparent for GIF
  },
  coinBalanceDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  coinBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBalanceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 8,
  },
  // User Tag Menu Styles
  userTagModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingBottom: 120,
  },
  userTagMenu: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  userTagHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  userTagTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  userTagList: {
    maxHeight: 150,
  },
  userTagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userTagInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userTagName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  userTagRole: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Connection Status Styles
  connectionStatusContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
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
  reconnectingDot: {
    backgroundColor: '#FF9800',
  },
  // Message Context Menu Styles
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
  messageMenuHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  messageMenuTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  messageMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  lastMessageMenuItem: {
    borderBottomWidth: 0,
  },
  messageMenuText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    fontWeight: '500',
  },
  // Mention Text Style
  mentionText: {
    color: '#007AFF',
    fontWeight: '600',
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
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#F44336',
  },
  callActionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
  },
  // Gift Message Styles
  giftMessageContainer: {
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  giftMessageBubble: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF69B4',
  },
  giftMessageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  giftMessageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  giftMessageInline: {
    marginLeft: 8,
    flex: 1,
  },
  giftInlineText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  giftLevelCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  giftLevelText: {
    fontSize: 10,
    color: 'white',
    fontWeight: 'bold',
  },
  // Room Info Message Styles
  roomInfoMessageContainer: {
    marginBottom: 2,
    paddingHorizontal: 0,
    paddingVertical: 2,
    marginHorizontal: 0,
  },
  roomInfoMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  roomInfoMessageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  roomInfoContent: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
});