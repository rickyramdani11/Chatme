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
  Easing, // For smooth animation curves
  Dimensions,
  ActivityIndicator,
  Keyboard,
  Platform,
  ImageBackground,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  AppState, // Added AppState for background reconnection
} from 'react-native';
import { Image } from 'expo-image';
import ReanimatedAnimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring,
  runOnJS 
} from 'react-native-reanimated';
import LottieView from 'lottie-react-native'; // For transparent gift animations
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks';
import { useRoute, useNavigation } from '@react-navigation/native';
import { registerBackgroundFetch, unregisterBackgroundFetch } from '../utils/backgroundTasks';
import { API_BASE_URL, SOCKET_URL } from '../utils/apiConfig';
import RoomManagement from '../components/RoomManagement';
import RedPacketModal from '../components/RedPacketModal';
import RedEnvelopeAnimation from '../components/RedEnvelopeAnimation';

const { width } = Dimensions.get('window');

const CARD_IMAGES: { [key: string]: any } = {
  'lc_2c.png': require('../../assets/card/lc_2c.png'),
  'lc_2d.png': require('../../assets/card/lc_2d.png'),
  'lc_2h.png': require('../../assets/card/lc_2h.png'),
  'lc_2s.png': require('../../assets/card/lc_2s.png'),
  'lc_3c.png': require('../../assets/card/lc_3c.png'),
  'lc_3d.png': require('../../assets/card/lc_3d.png'),
  'lc_3h.png': require('../../assets/card/lc_3h.png'),
  'lc_3s.png': require('../../assets/card/lc_3s.png'),
  'lc_4c.png': require('../../assets/card/lc_4c.png'),
  'lc_4d.png': require('../../assets/card/lc_4d.png'),
  'lc_4h.png': require('../../assets/card/lc_4h.png'),
  'lc_4s.png': require('../../assets/card/lc_4s.png'),
  'lc_5c.png': require('../../assets/card/lc_5c.png'),
  'lc_5d.png': require('../../assets/card/lc_5d.png'),
  'lc_5h.png': require('../../assets/card/lc_5h.png'),
  'lc_5s.png': require('../../assets/card/lc_5s.png'),
  'lc_6c.png': require('../../assets/card/lc_6c.png'),
  'lc_6d.png': require('../../assets/card/lc_6d.png'),
  'lc_6h.png': require('../../assets/card/lc_6h.png'),
  'lc_6s.png': require('../../assets/card/lc_6s.png'),
  'lc_7c.png': require('../../assets/card/lc_7c.png'),
  'lc_7d.png': require('../../assets/card/lc_7d.png'),
  'lc_7h.png': require('../../assets/card/lc_7h.png'),
  'lc_7s.png': require('../../assets/card/lc_7s.png'),
  'lc_8c.png': require('../../assets/card/lc_8c.png'),
  'lc_8d.png': require('../../assets/card/lc_8d.png'),
  'lc_8h.png': require('../../assets/card/lc_8h.png'),
  'lc_8s.png': require('../../assets/card/lc_8s.png'),
  'lc_9c.png': require('../../assets/card/lc_9c.png'),
  'lc_9d.png': require('../../assets/card/lc_9d.png'),
  'lc_9h.png': require('../../assets/card/lc_9h.png'),
  'lc_9s.png': require('../../assets/card/lc_9s.png'),
  'lc_10c.png': require('../../assets/card/lc_10c.png'),
  'lc_10d.png': require('../../assets/card/lc_10d.png'),
  'lc_10h.png': require('../../assets/card/lc_10h.png'),
  'lc_10s.png': require('../../assets/card/lc_10s.png'),
  'lc_jc.png': require('../../assets/card/lc_jc.png'),
  'lc_jd.png': require('../../assets/card/lc_jd.png'),
  'lc_jh.png': require('../../assets/card/lc_jh.png'),
  'lc_js.png': require('../../assets/card/lc_js.png'),
  'lc_qc.png': require('../../assets/card/lc_qc.png'),
  'lc_qd.png': require('../../assets/card/lc_qd.png'),
  'lc_qh.png': require('../../assets/card/lc_qh.png'),
  'lc_qs.png': require('../../assets/card/lc_qs.png'),
  'lc_kc.png': require('../../assets/card/lc_kc.png'),
  'lc_kd.png': require('../../assets/card/lc_kd.png'),
  'lc_kh.png': require('../../assets/card/lc_kh.png'),
  'lc_ks.png': require('../../assets/card/lc_ks.png'),
  'lc_ac.png': require('../../assets/card/lc_ac.png'),
  'lc_ad.png': require('../../assets/card/lc_ad.png'),
  'lc_ah.png': require('../../assets/card/lc_ah.png'),
  'lc_as.png': require('../../assets/card/lc_as.png'),
};

// Dice images mapping for Sicbo bot
const DICE_IMAGES: { [key: string]: any } = {
  '1': require('../../assets/dice/dice_1.jpg'),
  '2': require('../../assets/dice/dice_2.jpg'),
  '3': require('../../assets/dice/dice_3.jpg'),
  '4': require('../../assets/dice/dice_4.jpg'),
  '5': require('../../assets/dice/dice_5.jpg'),
  '6': require('../../assets/dice/dice_6.jpg'),
};

// Gift animation durations
const GIFT_ANIMATION_DURATION = {
  ANIMATED: 5000,
  STATIC: 3000,
  FADE_OUT: 600,
};

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: Date | string;
  roomId: string;
  role?: 'user' | 'merchant' | 'mentor' | 'admin' | 'system' | string;
  level?: number;
  type?: 'join' | 'leave' | 'message' | 'command' | 'me' | 'room_info' | 'report' | 'ban' | 'kick' | 'lock' | 'support' | 'gift' | 'error' | 'system' | 'broadcast' | string;
  commandType?: 'system' | 'bot';
  userRole?: 'user' | 'merchant' | 'mentor' | 'admin';
  image?: string;
  isSupport?: boolean;
  giftData?: any;
  recipient?: string;
  giftName?: string;
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
  lastMessage?: string;
  timestamp?: string;
  hasNewMessage?: boolean;
}

// Hardcoded color constants (restored from original theme)
const COLORS = {
  background: '#f5f5f5',
  surface: '#ffffff',
  card: '#ffffff',
  text: '#333333',
  textSecondary: '#666666',
  border: '#e0e0e0',
  primary: '#9C27B0',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
  successBadgeBg: '#E8F5E8',
  successBadgeText: '#4CAF50',
  errorBadgeBg: '#FFEBEE',
  errorBadgeText: '#F44336',
  infoBadgeBg: '#E3F2FD',
  infoBadgeText: '#2196F3',
  iconDefault: '#666666',
  statusOnline: '#4CAF50',
  badgeTextLight: '#ffffff',
  avatarBg: '#333333',
  switchThumb: '#ffffff',
  shadow: '#000000',
  roleAdmin: '#FF6B35',
  roleAdminBg: '#FFEBEE',
  roleMentor: '#FF5722',
  roleMentorBg: '#FBE9E7',
  roleMerchant: '#9C27B0',
  roleMerchantBg: '#F3E5F5',
  roleUser: '#2196F3',
  roleUserBg: '#E3F2FD',
  roleOwner: '#e8d31a',
  roleOwnerBg: '#fefce8',
  roleModerator: '#FFA500',
  roleModeratorBg: '#FFF4E6',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  avatarOverlay: 'rgba(255, 255, 255, 0.3)',
  textOverlay: 'rgba(255, 255, 255, 0.8)',
  borderOverlay: 'rgba(255, 255, 255, 0.3)',
  cardSubtle: 'rgba(0, 0, 0, 0.05)',
  successSubtle: 'rgba(34, 197, 94, 0.15)',
  textEmphasis: 'rgba(255, 255, 255, 0.9)',
};

export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState(0);
  const [message, setMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([]);
  const [showPopupMenu, setShowPopupMenu] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showRoomManagement, setShowRoomManagement] = useState(false);
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
  const [giftAnimationDuration, setGiftAnimationDuration] = useState(GIFT_ANIMATION_DURATION.ANIMATED); // Default to animated duration
  const giftScaleAnim = useRef(new Animated.Value(0)).current;
  const giftOpacityAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null); // Ref for the main ScrollView containing tabs
  const flatListRefs = useRef<Record<string, FlatList<Message> | null>>({}); // Refs for each FlatList in tabs
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true); // State for auto-scroll toggle
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Debounce scroll calls
  
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const socketRef = useRef<Socket | null>(null); // Track socket instance
  const lastGiftEventRef = useRef<Record<string, number>>({}); // Track last gift event by unique key to prevent duplicates
  const [broadcastMessages, setBroadcastMessages] = useState<Record<string, string | null>>({});
  const listenersSetupRef = useRef<boolean>(false); // Track if listeners are already set up
  
  // Red Packet States
  const [showRedPacketModal, setShowRedPacketModal] = useState(false);
  const [redPacketData, setRedPacketData] = useState<any>(null); // Active red packet to display
  const [userBalance, setUserBalance] = useState(0); // User credit balance
  const [claimedPackets, setClaimedPackets] = useState<number[]>([]); // Track claimed packet IDs
  
  // Gift Notification Auto-hide State
  const [hiddenGiftIds, setHiddenGiftIds] = useState<Set<string>>(new Set());
  const giftTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // Get user and token before any refs that depend on them
  const { user, token, logout } = useAuth();
  
  // Get room data from navigation params  
  const routeParams = (route.params as any) || {};
  const { roomId, roomName, roomDescription, autoFocusTab, type = 'room', targetUser, isSupport, password } = routeParams;
  
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

  // Fetch user balance for red packets
  useEffect(() => {
    const fetchBalance = async () => {
      if (!token) return;
      
      try {
        const response = await fetch(`${API_BASE_URL}/credits/balance`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUserBalance(data.balance || 0);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    };

    fetchBalance();
  }, [token, showRedPacketModal]);
  
  // Cleanup gift timers on unmount
  useEffect(() => {
    return () => {
      Object.values(giftTimersRef.current).forEach(timer => clearTimeout(timer));
      giftTimersRef.current = {};
    };
  }, []);

  // Auto-hide gift messages after 8 seconds
  useEffect(() => {
    chatTabs.forEach(tab => {
      tab.messages.forEach(message => {
        if (message.type === 'gift' && !hiddenGiftIds.has(message.id) && !giftTimersRef.current[message.id]) {
          giftTimersRef.current[message.id] = setTimeout(() => {
            setHiddenGiftIds(prev => {
              const newSet = new Set(prev);
              newSet.add(message.id);
              return newSet;
            });
            delete giftTimersRef.current[message.id];
          }, 8000);
        }
      });
    });
  }, [chatTabs]);
  
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(roomId || null);
  const [showUserGiftPicker, setShowUserGiftPicker] = useState(false);
  const [selectedGiftForUser, setSelectedGiftForUser] = useState<any>(null);

  // Create styles with hardcoded colors
  const styles = createThemedStyles();

  // Helper functions for role checking
  const isRoomOwner = () => {
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    return currentRoom && currentRoom.managedBy === user?.username;
  };

  const isRoomModerator = () => {
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    return currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
  };

  // Optimized scroll helper - debounced and instant
  const scrollToBottom = (roomId: string, instant: boolean = false) => {
    if (!autoScrollEnabledRef.current || isUserScrollingRef.current) {
      return;
    }

    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Immediate scroll without animation for better performance
    if (instant) {
      flatListRefs.current[roomId]?.scrollToEnd({ animated: false });
    } else {
      // Debounced scroll with minimal delay (reduced from 50ms to 10ms for faster message display)
      scrollTimeoutRef.current = setTimeout(() => {
        flatListRefs.current[roomId]?.scrollToEnd({ animated: false });
      }, 10);
    }
  };

  // Red Packet Handlers
  const handleSendRedPacket = (totalAmount: number, totalSlots: number, message: string) => {
    if (!socket || !user) return;

    const currentTab = chatTabs[activeTab];
    if (!currentTab) return;

    socket.emit('create-red-packet', {
      roomId: currentTab.id,
      senderId: user.id,
      senderName: user.username,
      totalAmount,
      totalSlots,
      message
    });

    // Optimistically update balance
    setUserBalance(prev => prev - totalAmount);
  };

  const handleClaimRedPacket = (packetId: number) => {
    if (!socket || !user) return;

    const currentTab = chatTabs[activeTab];
    if (!currentTab) return;

    socket.emit('claim-red-packet', {
      packetId,
      userId: user.id,
      username: user.username,
      roomId: currentTab.id
    });
  };

  // Function to join a specific room (called when navigating from RoomScreen)
  const joinSpecificRoom = async (roomId: string, roomName: string) => {
    try {
      console.log('Joining specific room/chat:', roomId, roomName, type || 'room', 'User:', user?.username);

      // Check if room already exists in tabs
      const existingTabIndex = chatTabs.findIndex(tab => tab.id === roomId);
      if (existingTabIndex !== -1) {
        // Room already exists - just switch to it (keep existing messages)
        console.log(`Switching to existing tab for room ${roomId}`);
        
        // Update room info if needed
        if (type !== 'private' && !isSupport) {
          try {
            const timestamp = Date.now();
            const roomResponse = await fetch(`${API_BASE_URL}/rooms?_t=${timestamp}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChatMe-Mobile-App',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
              },
              cache: 'no-store',
            });
            if (roomResponse.ok) {
              const rooms = await roomResponse.json();
              const roomData = rooms.find((r: any) => r.id.toString() === roomId.toString());
              
              if (roomData) {
                const updatedTabs = [...chatTabs];
                
                // Set broadcast message from room data
                if (roomData.broadcastMessage) {
                  setBroadcastMessages(prev => ({
                    ...prev,
                    [roomId]: roomData.broadcastMessage
                  }));
                }
                
                const ownerName = roomData.createdBy || roomData.created_by || roomData.managedBy || roomData.managed_by || 'System';
                
                // Update tab metadata for permission checks
                updatedTabs[existingTabIndex].managedBy = ownerName;
                if (roomData.moderators) {
                  updatedTabs[existingTabIndex].moderators = roomData.moderators;
                }
                
                console.log(`✅ Updated tab metadata - managedBy: ${ownerName}`);
                setChatTabs(updatedTabs);
              }
            }
          } catch (error) {
            console.log('Could not update cached room info');
          }
        }
        
        // Switch to existing tab
        setActiveTab(existingTabIndex);
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            x: existingTabIndex * width,
            animated: true
          });
        }
        return;
      }

      // Start with empty messages - no message history loaded
      let messages: any[] = [];
      console.log('Starting fresh chat session with no message history');

      // Get room data to get correct managedBy info
        let roomData: any = null;
        if (type !== 'private' && !isSupport) {
          try {
            // Add timestamp to force fresh request and bypass cache
            const timestamp = Date.now();
            console.log('🔄 Fetching room data for roomId:', roomId);
            const roomResponse = await fetch(`${API_BASE_URL}/rooms?_t=${timestamp}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChatMe-Mobile-App',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
              },
              cache: 'no-store',
            });
            console.log('📡 Room fetch response status:', roomResponse.status, roomResponse.ok);
            if (roomResponse.ok) {
              const rooms = await roomResponse.json();
              console.log('📋 All rooms received:', rooms.length);
              console.log('🔍 Looking for roomId:', roomId, 'Type:', typeof roomId);
              roomData = rooms.find((r: any) => r.id.toString() === roomId.toString());
              console.log('🔍 DEBUG Room Data:', JSON.stringify(roomData, null, 2));
              console.log('🔍 managedBy:', roomData?.managedBy);
              console.log('🔍 createdBy:', roomData?.createdBy);
              
              if (!roomData) {
                console.warn('⚠️ Room not found in response! Trying with strict equality...');
                roomData = rooms.find((r: any) => r.id === roomId);
                console.log('🔍 Retry result:', roomData ? 'Found!' : 'Still not found');
              }
              
              // Set broadcast message from room data
              if (roomData && roomData.broadcastMessage) {
                setBroadcastMessages(prev => ({
                  ...prev,
                  [roomId]: roomData.broadcastMessage
                }));
              }
            } else {
              console.error('❌ Room fetch failed with status:', roomResponse.status);
            }
          } catch (error) {
            console.error('❌ Error fetching room data:', error);
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

          // Created by message
          console.log('🔍 DEBUG roomData for room info:', JSON.stringify(roomData, null, 2));
          console.log('🔍 managedBy:', roomData?.managedBy);
          console.log('🔍 managed_by:', roomData?.managed_by);
          console.log('🔍 createdBy:', roomData?.createdBy);
          console.log('🔍 created_by:', roomData?.created_by);
          const ownerUsername = roomData?.createdBy || roomData?.created_by || roomData?.managedBy || roomData?.managed_by || 'System';
          console.log('🔍 Owner username for room info:', ownerUsername);
          roomInfoMessages.push({
            id: `room_info_managed_${roomId}`,
            sender: roomName,
            content: `This room is created by ${ownerUsername}`,
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
          
          // Add broadcast message if exists
          if (roomData?.broadcastMessage) {
            roomInfoMessages.push({
              id: `broadcast_${roomId}`,
              sender: roomName,
              content: roomData.broadcastMessage,
              timestamp: new Date(currentTime.getTime() - 500), // After currently in room
              roomId: roomId,
              role: 'admin',
              level: 1,
              type: 'broadcast'
            });
          }
        }

        // Normalize room_info messages from database history to use correct owner name
        if (roomData && messages.length > 0) {
          const ownerName = roomData.createdBy || roomData.created_by || roomData.managedBy || roomData.managed_by || 'System';
          messages = messages.map((msg: any) => {
            if (msg.type === 'room_info' && (msg.content?.startsWith('This room is managed by') || msg.content?.startsWith('This room is created by'))) {
              return {
                ...msg,
                content: `This room is created by ${ownerName}`
              };
            }
            return msg;
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
          managedBy: type === 'private' ? targetUser?.username : (roomData?.createdBy || roomData?.created_by || roomData?.managedBy || roomData?.managed_by || 'System'),
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
          const joinData: any = {
            roomId: roomId,
            username: user?.username || 'Guest',
            role: user?.role || 'user'
          };
          
          // Include password if provided (for locked rooms)
          if (password) {
            joinData.password = password;
          }
          
          socket.emit('join-room', joinData);
        }
      }

    } catch (error) {
      console.error('Error joining specific room:', error);
    }
  };

  // Initialize socket with persistent connection and auto-reconnect
  useEffect(() => {
    const setupSocketListeners = (socketInstance: Socket) => {
      // If listeners are already set up for this socket, skip setup to prevent duplicates
      if (listenersSetupRef.current) {
        console.log('Listeners already set up, skipping duplicate setup');
        return;
      }
      
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
      socketInstance.removeAllListeners('moderator-updated'); // Listener for moderator changes

      socketInstance.off('new-message');
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
              scrollToBottom(tab.id);

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
        
        // Force scroll to bottom for current room messages
        if (newMessage.roomId === chatTabsRef.current[activeTabRef.current]?.id) {
          scrollToBottom(newMessage.roomId, true);
        }
      });

      socketInstance.off('user-joined');
      socketInstance.on('user-joined', (joinMessage: Message) => {
        setChatTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === joinMessage.roomId
              ? { ...tab, messages: [...tab.messages, joinMessage] }
              : tab
          )
        );
      });

      socketInstance.off('user-left');
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
      socketInstance.off('participants-updated');
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

      // Listen for broadcast updates
      socketInstance.off('broadcast-updated');
      socketInstance.on('broadcast-updated', (data: { roomId: string; broadcastMessage: string | null }) => {
        console.log('📢 Broadcast updated for room', data.roomId, ':', data.broadcastMessage);
        setBroadcastMessages(prev => ({
          ...prev,
          [data.roomId]: data.broadcastMessage
        }));
        
        // Update messages in chat tabs
        setChatTabs(prevTabs =>
          prevTabs.map(tab => {
            if (tab.id === data.roomId) {
              // Remove old broadcast message if exists
              let updatedMessages = tab.messages.filter(msg => msg.id !== `broadcast_${data.roomId}`);
              
              // Add new broadcast message if provided
              if (data.broadcastMessage) {
                const broadcastMsg = {
                  id: `broadcast_${data.roomId}`,
                  sender: tab.title,
                  content: data.broadcastMessage,
                  timestamp: new Date(),
                  roomId: data.roomId,
                  role: 'admin' as const,
                  level: 1,
                  type: 'broadcast' as const
                };
                
                // Insert after room_info_current message
                const currentIndex = updatedMessages.findIndex(msg => msg.id === `room_info_current_${data.roomId}`);
                if (currentIndex !== -1) {
                  updatedMessages.splice(currentIndex + 1, 0, broadcastMsg);
                } else {
                  updatedMessages.push(broadcastMsg);
                }
              }
              
              return { ...tab, messages: updatedMessages };
            }
            return tab;
          })
        );
      });

      // Listen for moderator updates
      socketInstance.off('moderator-updated');
      socketInstance.on('moderator-updated', (data: { roomId: string; username: string; action: 'added' | 'removed' }) => {
        console.log('🛡️ Moderator updated:', data);
        
        setChatTabs(prevTabs =>
          prevTabs.map(tab => {
            if (tab.id === data.roomId) {
              let updatedModerators = [...(tab.moderators || [])];
              
              if (data.action === 'added') {
                // Add moderator if not already in list
                if (!updatedModerators.includes(data.username)) {
                  updatedModerators.push(data.username);
                  console.log(`✅ Added ${data.username} as moderator in room ${data.roomId}`);
                }
              } else if (data.action === 'removed') {
                // Remove moderator from list
                updatedModerators = updatedModerators.filter(mod => mod !== data.username);
                console.log(`❌ Removed ${data.username} as moderator from room ${data.roomId}`);
              }
              
              return { ...tab, moderators: updatedModerators };
            }
            return tab;
          })
        );
      });

      // Listen for user kicked events
      socketInstance.off('user-kicked');
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
      socketInstance.off('user-muted');
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
      socketInstance.off('user-banned');
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

      // Listen for rate limit errors (anti-flood)
      socketInstance.off('rate-limit-error');
      socketInstance.on('rate-limit-error', (data: any) => {
        console.log('⚠️ Rate limit error:', data);
        Alert.alert(
          data.type === 'cooldown' ? 'Slow Down!' : 'Temporarily Muted',
          data.error,
          [{ text: 'OK' }]
        );
      });

      // Listen for gift broadcasts from server
      socketInstance.off('receiveGift');
      socketInstance.on('receiveGift', (data: any) => {
        console.log('Received gift broadcast:', data);

        // ✅ CRITICAL: Check lastGiftEventRef to prevent duplicates from multiple socket instances
        const giftKey = `${data.roomId}_${data.sender}_${data.recipient}_${data.gift?.name}_${data.timestamp}`;
        const now = Date.now();
        
        if (lastGiftEventRef.current[giftKey] && (now - lastGiftEventRef.current[giftKey] < 3000)) {
          console.log('🚫 Duplicate gift event blocked by lastGiftEventRef:', giftKey);
          return; // Block duplicate within 3 seconds
        }
        
        // Track this gift event
        lastGiftEventRef.current[giftKey] = now;
        
        // Cleanup old entries from lastGiftEventRef (keep only last 10 seconds)
        Object.keys(lastGiftEventRef.current).forEach(key => {
          if (now - lastGiftEventRef.current[key] > 10000) {
            delete lastGiftEventRef.current[key];
          }
        });

        // ✅ REMOVED duplicate gift notification message - only use single gift message below (line ~1369)

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
            duration: GIFT_ANIMATION_DURATION.FADE_OUT,
            useNativeDriver: true,
          }),
        ]).start();

        // Auto-close timing based on gift type (same logic as private gifts)
        const animationStr = data.gift.animation?.uri || data.gift.videoUrl || (typeof data.gift.animation === 'string' ? data.gift.animation : '');
        const isVideoGift = data.gift.mediaType === 'video' || (
          animationStr && 
          (animationStr.toLowerCase().includes('.mp4') || 
           animationStr.toLowerCase().includes('.webm') || 
           animationStr.toLowerCase().includes('.mov'))
        );

        // For non-video gifts, use fixed timeout with smooth Reanimated fade-out
        if (!isVideoGift) {
          const duration = data.gift.type === 'animated' ? GIFT_ANIMATION_DURATION.ANIMATED : GIFT_ANIMATION_DURATION.STATIC;
          setTimeout(() => {
            // Smooth fade-out with Reanimated (more efficient & native)
            Animated.parallel([
              Animated.timing(giftScaleAnim, {
                toValue: 1.1, // Slight zoom out effect
                duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Smooth easing curve
                useNativeDriver: true,
              }),
              Animated.timing(giftOpacityAnim, {
                toValue: 0,
                duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                easing: Easing.bezier(0.33, 0, 0.67, 1), // Smooth easing
                useNativeDriver: true,
              }),
            ]).start(() => {
              setActiveGiftAnimation(null);
            });
          }, duration);
        }
        // For video gifts, auto-close is handled by video completion callback

        // Add gift message to chat
        const giftMessageId = `gift_${Date.now()}_${data.sender}`;
        const recipientText = data.recipient || 'someone';
        const targetRoomId = chatTabs[activeTab]?.id || data.roomId; // Capture room ID at receive time
        const giftMessage: Message = {
          id: giftMessageId,
          sender: data.sender,
          content: `${data.sender} send ${data.gift.name} to ${recipientText}`,
          timestamp: new Date(data.timestamp),
          roomId: targetRoomId,
          role: data.role || 'user',
          level: data.level || 1,
          type: 'gift',
          giftData: data.gift
        };

        setChatTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.id === targetRoomId
              ? { ...tab, messages: [...tab.messages, giftMessage] }
              : tab
          )
        );

        // Gift message now persists - no auto-hide
      });

      // Listen for private gift notifications
      socketInstance.off('receive-private-gift');
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
            duration: GIFT_ANIMATION_DURATION.FADE_OUT,
            useNativeDriver: true,
          }),
        ]).start();

        // Auto-close timing based on gift type
        const animationStr = data.gift.animation?.uri || data.gift.videoUrl || (typeof data.gift.animation === 'string' ? data.gift.animation : '');
        const isVideoGift = data.gift.mediaType === 'video' || (
          animationStr && 
          (animationStr.toLowerCase().includes('.mp4') || 
           animationStr.toLowerCase().includes('.webm') || 
           animationStr.toLowerCase().includes('.mov'))
        );

        // For non-video gifts, use fixed timeout with smooth Reanimated fade-out
        if (!isVideoGift) {
          const duration = data.gift.type === 'animated' ? GIFT_ANIMATION_DURATION.ANIMATED : GIFT_ANIMATION_DURATION.STATIC;
          setTimeout(() => {
            // Smooth fade-out with improved easing
            Animated.parallel([
              Animated.timing(giftScaleAnim, {
                toValue: 1.1,
                duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Smooth easing curve
                useNativeDriver: true,
              }),
              Animated.timing(giftOpacityAnim, {
                toValue: 0,
                duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                easing: Easing.bezier(0.33, 0, 0.67, 1), // Smooth easing
                useNativeDriver: true,
              }),
            ]).start(() => {
              setActiveGiftAnimation(null);
            });
          }, duration);
        }
        // For video gifts, auto-close is handled by video completion callback
      });

      socketInstance.off('gift-animation');

      // Listen for admin joined support chat
      socketInstance.off('admin-joined');
      socketInstance.on('admin-joined', (data: any) => {
        console.log('Admin joined support chat:', data);
        const adminMessage: Message = {
          id: `admin_join_${Date.now()}`,
          sender: 'System',
          content: data.message,
          timestamp: new Date(),
          roomId: currentRoomId || 'unknown', // Use currentRoomId for context
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
      socketInstance.off('support-message');
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

              // Auto-scroll if enabled
              scrollToBottom(tab.id);

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


      // Red Packet Listeners
      socketInstance.off('red-packet-dropped');
      socketInstance.on('red-packet-dropped', (data: any) => {
        console.log('🧧 Red packet dropped:', data);
        setRedPacketData(data.packet);
      });

      socketInstance.off('red-packet-update');
      socketInstance.on('red-packet-update', (data: any) => {
        console.log('🧧 Red packet update:', data);
        if (redPacketData && redPacketData.id === data.packetId) {
          setRedPacketData({
            ...redPacketData,
            remainingSlots: data.remainingSlots,
            remainingAmount: data.remainingAmount,
            status: data.status
          });
        }
        
        // Show claim message for all users in room
        if (data.claimInfo && data.roomId) {
          const claimMessage: Message = {
            id: `claim-${data.claimInfo.userId}-${Date.now()}`,
            content: `${data.claimInfo.username} mendapat ${data.claimInfo.amount} coin`,
            sender: 'System',
            type: 'system',
            timestamp: new Date().toISOString(),
            role: 'system',
            roomId: data.roomId
          };
          
          // Add to correct room tab (based on event's roomId)
          setChatTabs(prevTabs => {
            const updatedTabs = [...prevTabs];
            const tabIndex = updatedTabs.findIndex(tab => tab.id === data.roomId);
            if (tabIndex !== -1) {
              const isActiveTab = data.roomId === currentRoomId;
              updatedTabs[tabIndex] = {
                ...updatedTabs[tabIndex],
                messages: [...(updatedTabs[tabIndex].messages || []), claimMessage],
                lastMessage: claimMessage.content,
                timestamp: new Date().toISOString(),
                hasNewMessage: !isActiveTab // Set badge if not active tab
              };
            }
            return updatedTabs;
          });
        }
      });

      socketInstance.off('red-packet-completed');
      socketInstance.on('red-packet-completed', (data: any) => {
        console.log('🧧 Red packet completed:', data);
        if (redPacketData && redPacketData.id === data.packetId) {
          setRedPacketData(null); // Remove from display
        }
      });

      socketInstance.off('red-packet-claimed-success');
      socketInstance.on('red-packet-claimed-success', (data: any) => {
        console.log('🧧 Red packet claimed successfully:', data);
        // Update claimed packets list
        setClaimedPackets(prev => [...prev, data.packetId]);
        
        // Hide red packet immediately for claimer
        setRedPacketData(null);
        
        // Chat message will be shown via 'red-packet-update' broadcast
      });

      socketInstance.off('red-packet-claimed-error');
      socketInstance.on('red-packet-claimed-error', (data: any) => {
        console.log('🧧 Red packet claim error:', data);
        Alert.alert('Error', data.message);
      });

      socketInstance.off('red-packet-created');
      socketInstance.on('red-packet-created', (data: any) => {
        console.log('🧧 Red packet created response:', data);
        if (!data.success) {
          Alert.alert('Error', data.message || 'Failed to create red packet');
        }
      });
      
      // Mark listeners as set up
      listenersSetupRef.current = true;
      console.log('Socket listeners set up successfully');
    };

    const initializeSocket = () => {
      console.log('Initializing socket connection...');
      console.log('Gateway URL:', SOCKET_URL); // Use SOCKET_URL which points to the gateway

      if (!token) {
        console.error('No authentication token available');
        return;
      }

      // ✅ CRITICAL: Disconnect and cleanup old socket before creating new one to prevent duplicate listeners
      if (socketRef.current) {
        console.log('🧹 Cleaning up old socket connection...');
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        listenersSetupRef.current = false;
        console.log('✅ Old socket cleaned up');
      }

      // Initialize socket connection to gateway with better stability options
      const newSocket = io(SOCKET_URL, { // Use SOCKET_URL
        transports: ['polling', 'websocket'], // Start with polling first for better Replit compatibility
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity, // ✅ Unlimited reconnection attempts for maximum stability
        timeout: 30000, // Increased timeout for better connection stability
        forceNew: true, // ✅ CRITICAL: Force new connection and terminate old socket to prevent duplicates
        upgrade: true,
        rememberUpgrade: false, // Don't remember upgrade for better compatibility
        closeOnBeforeunload: false, // Keep connection alive during app state changes
        auth: {
          token: token
        }
      });

      // ✅ CRITICAL: Assign socketRef IMMEDIATELY after creation to prevent race conditions
      socketRef.current = newSocket;
      console.log('✅ New socket assigned to ref immediately');

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
            console.log(`Rejoining ${currentTabs.length} rooms after reconnection (silent mode)`);
            currentTabs.forEach((tab, index) => {
              // Stagger room rejoining to prevent server overload
              setTimeout(() => {
                console.log('Rejoining room after reconnect (silent):', tab.id, currentUser.username);
                if (tab.isSupport) {
                  newSocket.emit('join-support-room', {
                    supportRoomId: tab.id,
                    isAdmin: currentUser.role === 'admin',
                    silent: true // Silent rejoin - no broadcast message
                  });
                } else {
                  newSocket.emit('join-room', {
                    roomId: tab.id,
                    username: currentUser.username,
                    role: currentUser.role || 'user',
                    silent: true // Silent rejoin - no broadcast message
                  });
                }
              }, index * 100); // 100ms delay between each room join
            });
          }
        }, 200); // Initial delay to ensure connection is stable
      });

      newSocket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected from gateway:', reason);
        setIsSocketConnected(false);
        
        // Reset listeners flag so they can be set up again on reconnection
        listenersSetupRef.current = false;
        console.log('Listeners flag reset on disconnect');

        // Log disconnect reasons for debugging
        const disconnectReasons: { [key: string]: string } = {
          'io server disconnect': 'Server manually disconnected (may need manual reconnect)',
          'io client disconnect': 'Client manually disconnected',
          'ping timeout': 'Ping timeout - no pong received (auto-reconnecting)',
          'transport close': 'Network/transport issue (auto-reconnecting)',
          'transport error': 'Transport error occurred (auto-reconnecting)',
        };
        
        console.log(`📋 Reason: ${disconnectReasons[reason] || reason}`);

        // Only attempt manual reconnection if server forcibly disconnected
        if (reason === 'io server disconnect') {
          console.log('🔄 Server disconnect - initiating manual reconnect');
          setTimeout(() => {
            newSocket.connect();
          }, 1000);
          return;
        }

        // For other disconnects, Socket.IO will auto-reconnect with Infinity attempts
        if (reason !== 'io client disconnect') {
          console.log('✅ Auto-reconnection enabled - Socket.IO will handle reconnection');
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error.message);
        console.error('🌐 Gateway URL:', SOCKET_URL);
        setIsSocketConnected(false);

        // Log error type for debugging
        if (error.message && error.message.includes('websocket error')) {
          console.log('🔄 WebSocket error - will fallback to polling transport');
        } else if (error.message && error.message.includes('timeout')) {
          console.log('⏱️ Connection timeout - will retry automatically');
        }

        // Socket.IO will auto-reconnect with exponential backoff
        console.log('✅ Auto-reconnection active - Socket.IO handling retry');
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

      // ✅ Ping/Pong monitoring for connection stability
      newSocket.io.on('ping', () => {
        console.log('🏓 Ping received from server (heartbeat check)');
      });

      newSocket.io.on('reconnect_attempt', (attempt) => {
        console.log(`🔄 Reconnection attempt #${attempt}`);
      });

      newSocket.io.on('reconnect_error', (error) => {
        console.error('❌ Reconnection error:', error.message);
      });

      // Monitor connection state changes
      newSocket.on('error', (error) => {
        console.error('⚠️ Socket error:', error);
      });

      // Reset listeners flag before setting new socket
      listenersSetupRef.current = false;
      // socketRef.current already assigned immediately after socket creation (line 1661)
      setSocket(newSocket);
    };

    const attemptReconnection = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('❌ Max reconnection attempts reached - logging out user');
        
        // Show alert to user
        Alert.alert(
          'Connection Lost',
          'Unable to connect to server. You will be logged out.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Disconnect socket using ref
                if (socketRef.current) {
                  socketRef.current.removeAllListeners();
                  socketRef.current.disconnect();
                  socketRef.current = null;
                }
                setSocket(null);
                
                // Clear all data and logout
                setChatTabs([]);
                setMessage('');
                logout();
              }
            }
          ],
          { cancelable: false }
        );
        return;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000); // Exponential backoff
      console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts + 1})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);

        // Use socketRef.current for disconnecting
        if (socketRef.current) {
          socketRef.current.disconnect();
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
        
        // Use socketRef.current for all socket operations
        if (socketRef.current) {
          // Always re-setup listeners and rejoin rooms for better reliability
          console.log('Re-setup listeners and rejoin rooms on app active');
          setupSocketListeners(socketRef.current);

          // Force reconnection if not connected
          if (!socketRef.current.connected) {
            console.log('Socket not connected, forcing reconnection');
            socketRef.current.disconnect();
            setTimeout(() => {
              if (socketRef.current) {
                socketRef.current.connect();
              }
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
                  if (socketRef.current) {
                    if (tab.isSupport) {
                      socketRef.current.emit('join-support-room', {
                        supportRoomId: tab.id,
                        isAdmin: currentUser.role === 'admin'
                      });
                    } else {
                      socketRef.current.emit('join-room', {
                        roomId: tab.id,
                        username: currentUser.username,
                        role: currentUser.role || 'user'
                      });
                    }
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

        // Ensure current tab messages are visible
        setTimeout(() => {
          const currentTabId = chatTabsRef.current[activeTabRef.current]?.id;
          if (currentTabId) {
            scrollToBottom(currentTabId, true);
          }
        }, 400);
        
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

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      appStateSubscription?.remove();

      // Use socketRef.current for cleanup
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
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
        
        // Auto-scroll to bottom when keyboard appears - INSTANT for better UX
        const currentTab = chatTabsRef.current[activeTabRef.current];
        if (currentTab && autoScrollEnabledRef.current) {
          // Use immediate scroll (no delay) for instant response
          setTimeout(() => {
            flatListRefs.current[currentTab.id]?.scrollToEnd({ animated: false });
          }, 100); // Minimal delay to let keyboard animation start
        }
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        
        // Auto-scroll when keyboard hides - INSTANT for better UX
        const currentTab = chatTabsRef.current[activeTabRef.current];
        if (currentTab && autoScrollEnabledRef.current) {
          setTimeout(() => {
            flatListRefs.current[currentTab.id]?.scrollToEnd({ animated: false });
          }, 100);
        }
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

  // Listen for navigation params changes (when screen is already mounted)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const params = route.params as any;
      if (params?.roomId && params?.roomName && params?.autoFocusTab && socket) {
        console.log('🔄 Screen focused with new params:', params.roomId, params.roomName, params.type);
        joinSpecificRoom(params.roomId, params.roomName);
        
        // Clear autoFocusTab param to prevent re-triggering
        navigation.setParams({ autoFocusTab: undefined } as any);
      }
    });

    return unsubscribe;
  }, [navigation, socket]);

  // Effect untuk mempertahankan state pesan saat app kembali aktif
  useEffect(() => {
    const preserveMessageState = () => {
      // Pastikan semua pesan tetap terlihat setelah app kembali aktif
      if (chatTabs.length > 0 && activeTab >= 0 && chatTabs[activeTab]) {
        const currentTab = chatTabs[activeTab];
        console.log(`Preserving messages for tab: ${currentTab.title}, Messages count: ${currentTab.messages.length}`);
        
        // Force update FlatList jika ada pesan
        if (currentTab.messages.length > 0) {
          scrollToBottom(currentTab.id, true);
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
      console.log('Loading rooms from:', `${API_BASE_URL}/rooms`);
      const response = await fetch(`${API_BASE_URL}/rooms`, {
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
            const messagesResponse = await fetch(`${API_BASE_URL}/messages/${targetRoom.id}`, {
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

    // Ensure messages are visible in the new tab
    if (chatTabs[index] && chatTabs[index].messages.length > 0 && selectedRoomId) {
      console.log(`Switching to tab ${index}: ${chatTabs[index].title}, Messages: ${chatTabs[index].messages.length}`);
      setTimeout(() => scrollToBottom(selectedRoomId, true), 100);
    }
  };


  const getRoleColor = (role?: string, username?: string, currentRoomId?: string) => {
    // Admin role takes highest precedence
    if (role === 'admin') return COLORS.roleAdmin;

    // Check if user is owner of current room
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && username && currentRoom.moderators.includes(username);

    if (isOwner) return COLORS.roleOwner;
    if (isModerator) return COLORS.roleModerator;

    switch (role) {
      case 'user': return COLORS.roleUser;
      case 'merchant': return COLORS.roleMerchant;
      case 'mentor': return COLORS.roleMentor;
      default: return COLORS.roleUser;
    }
  };

  // Helper function to get level badge color (gradient green to blue)
  const getLevelBadgeColor = (level: number) => {
    if (level >= 10) {
      return COLORS.info; // Full blue at level 10+
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
    if (role === 'admin') return COLORS.roleAdminBg;

    // Check if user is owner of current room
    const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
    const isOwner = currentRoom && currentRoom.managedBy === username;

    // Check if user is moderator of current room
    const isModerator = currentRoom && currentRoom.moderators && username && currentRoom.moderators.includes(username);

    if (isOwner) return COLORS.roleOwnerBg;
    if (isModerator) return COLORS.roleModeratorBg;

    switch (role) {
      case 'user': return COLORS.roleUserBg;
      case 'merchant': return COLORS.roleMerchantBg;
      case 'mentor': return COLORS.roleMentorBg;
      default: return COLORS.roleUserBg;
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


      case '/ban': {
        // Check if user has permission to ban user
        const currentRoom = chatTabs.find(tab => tab.id === currentRoomId);
        const isOwner = currentRoom && currentRoom.managedBy === user?.username;
        const isModerator = currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
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
              sender: user?.username || 'User',
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
        const isModerator = currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
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
        const isModerator = currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
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

          // Server will broadcast the lock message, no need to send separately
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
        const isModerator = currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
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
        const isModerator = currentRoom && currentRoom.moderators && user?.username && currentRoom.moderators.includes(user.username);
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
        // Unknown command - do nothing, no error message shown
        break;
      }
    }

    // Auto-scroll after command
    scrollToBottom(currentRoomId, true);
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
      // BUT: Admin/bot commands (/add, /bot, /sicbo off, /broadcast, etc) should be sent to server
      const isAdminCommand = messageContent.startsWith('/add') || 
                             messageContent.startsWith('/bot') || 
                             messageContent.startsWith('/sicbo') ||
                             messageContent.startsWith('/lowcard') ||
                             messageContent.startsWith('/broadcast');
      
      if (messageContent.startsWith('/') && !currentTab?.isSupport && !isAdminCommand) {
        handleSpecialCommand(messageContent, currentRoomId);
        setMessage('');
        setSelectedImageEmojis([]);
        setShowUserTagMenu(false);
        
        // Auto-close keyboard for special commands
        Keyboard.dismiss();
        return;
      }

      // Skip optimistic UI for game commands (! commands) - they are handled by server and bot responses
      if (messageContent.startsWith('!') && !currentTab?.isSupport) {
        setMessage('');
        setSelectedImageEmojis([]);
        setShowUserTagMenu(false);
        
        // Auto-close keyboard for game commands
        Keyboard.dismiss();
        
        // Send game command to server (no optimistic message)
        socket.emit('sendMessage', {
          roomId: currentRoomId,
          sender: user.username,
          content: messageContent,
          role: user.role || 'user',
          level: user.level || 1,
          type: 'message'
        });
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
      
      // Auto-close keyboard after sending message
      Keyboard.dismiss();
      
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

      // Auto-scroll immediately after sending
      scrollToBottom(currentRoomId, true);

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
    // Navigate to Room screen (safe navigation without canGoBack check)
    try {
      navigation.navigate('Room' as never);
    } catch (error) {
      console.log('Navigation error:', error);
    }
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

        // CRITICAL: Immediately update ref to prevent auto-rejoin on reconnect
        chatTabsRef.current = newTabs;

        // If no tabs left, navigate to Room screen
        if (newTabs.length === 0) {
          setTimeout(() => {
            navigation.navigate('Room' as any);
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

  const handleRoomManagement = () => {
    setShowPopupMenu(false);
    setShowRoomManagement(true);
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
              const participantNames = participantData.map((p: any) => p.username).join(', ');
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
      const response = await fetch(`${API_BASE_URL}/chat/private`, {
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
        // If API fails, still navigate to private chat with constructed roomId
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Private chat creation failed, navigating anyway:', errorData);
        
        // Construct roomId from user IDs
        const fallbackRoomId = `private_${user?.id}_${selectedParticipant?.id || selectedParticipant?.username}`;
        
        const targetUser = {
          id: selectedParticipant?.id || selectedParticipant?.username || Date.now().toString(),
          username: selectedParticipant?.username,
          role: selectedParticipant?.role || 'user',
          level: selectedParticipant?.level || 1,
          avatar: selectedParticipant?.avatar || null
        };

        // Navigate to private chat even on error
        navigation.navigate('Chat', {
          roomId: fallbackRoomId,
          roomName: `Chat with ${selectedParticipant?.username}`,
          roomDescription: `Private chat with ${selectedParticipant?.username}`,
          type: 'private',
          targetUser: targetUser,
          autoFocusTab: true
        });
      }
    } catch (error) {
      console.error('Error creating private chat, navigating anyway:', error);
      
      // Still navigate to private chat on network error
      const fallbackRoomId = `private_${user?.id}_${selectedParticipant?.id || selectedParticipant?.username}`;
      
      const targetUser = {
        id: selectedParticipant?.id || selectedParticipant?.username || Date.now().toString(),
        username: selectedParticipant?.username,
        role: selectedParticipant?.role || 'user',
        level: selectedParticipant?.level || 1,
        avatar: selectedParticipant?.avatar || null
      };

      // Navigate to private chat even on error
      navigation.navigate('Chat', {
        roomId: fallbackRoomId,
        roomName: `Chat with ${selectedParticipant?.username}`,
        roomDescription: `Private chat with ${selectedParticipant?.username}`,
        type: 'private',
        targetUser: targetUser,
        autoFocusTab: true
      });
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
      // Strip card and dice tags from content before copying
      const cleanContent = selectedMessage.content
        .replace(/<card:[^>]+>/g, '')
        .replace(/<dice:[^>]+>/g, '');
      const messageText = `${selectedMessage.sender}: ${cleanContent}`;

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

  const renderMessageContent = (content: string, textStyle?: any) => {
    // Split content by @ mentions, card tags, dice tags, img tags, and localimg tags
    const parts = content.split(/(@\w+|<card:[^>]+>|<dice:[^>]+>|<img:[^>]+>|<localimg:[^>]+>)/g);

    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        // Style @ mentions
        return (
          <Text key={index} style={[textStyle, styles.mentionText]}>
            {part}
          </Text>
        );
      } else if (part.startsWith('<card:') && part.endsWith('>')) {
        // Extract card image filename from LowCardBot (remove <card: and >)
        const cardPath = part.substring(6, part.length - 1);
        const cardFilename = cardPath.split('/').pop() || '';
        const cardSource = CARD_IMAGES[cardFilename];
        
        if (cardSource) {
          return (
            <View key={index} style={styles.cardImageWrapper}>
              <Image
                source={cardSource}
                style={styles.cardInlineImage}
                resizeMode="contain"
              />
            </View>
          );
        }
        return null;
      } else if (part.startsWith('<dice:') && part.endsWith('>')) {
        // Extract dice number from SicboBot (remove <dice: and >)
        const diceNumber = part.substring(6, part.length - 1);
        const diceSource = DICE_IMAGES[diceNumber];
        
        if (diceSource) {
          return (
            <View key={index} style={styles.diceImageWrapper}>
              <Image
                source={diceSource}
                style={styles.diceInlineImage}
                resizeMode="contain"
              />
            </View>
          );
        }
        return null;
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
      }
      // Wrap plain strings in Text with provided style
      return <Text key={index} style={textStyle}>{part}</Text>;
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
            <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'}}>
              <Text style={[
                styles.senderName,
                styles.messageContent,
                { 
                  color: isBotCommand ? COLORS.success : isSystemCommand ? COLORS.text : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id)
                }
              ]}>
                {item.sender}
              </Text>
              <Text style={[
                styles.messageContent,
                { 
                  color: isBotCommand ? COLORS.info : COLORS.text, 
                  fontWeight: 'bold',
                  fontStyle: isBotCommand ? 'italic' : 'normal'
                }
              ]}>
                {': '}
              </Text>
              {renderMessageContent(item.content, [
                styles.messageContent,
                { 
                  color: isBotCommand ? COLORS.info : COLORS.text, 
                  fontWeight: 'bold',
                  fontStyle: isBotCommand ? 'italic' : 'normal'
                }
              ])}
            </View>
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
              <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>
                : {renderMessageContent(item.content)}
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
                <Text style={[styles.senderName, { color: COLORS.warning }]}>
                  {item.sender}:{' '}
                </Text>
                <Text style={[styles.messageContent, { color: COLORS.text }]}>
                  {renderMessageContent(item.content)}
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
                <Text style={{ color: COLORS.text }}>{renderMessageContent(item.content)}</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.commandMessageRow}>
              <Text style={styles.commandContentText}>
                {renderMessageContent(item.content, { color: COLORS.text })}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // Handle broadcast messages (admin announcements)
    if (item.type === 'broadcast') {
      return (
        <TouchableOpacity 
          style={styles.broadcastMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.broadcastMessageRow}>
            <Ionicons name="megaphone" size={18} color={COLORS.success} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              {renderMessageContent(item.content, styles.broadcastMessageText)}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Handle system messages (from System sender) - INCLUDING roll messages
    if (item.sender === 'System' || item.role === 'system') {
      return (
        <TouchableOpacity 
          style={styles.systemMessageContainer}
          onLongPress={() => handleMessageLongPress(item)}
        >
          <View style={styles.systemMessageRow}>
            <Text style={[styles.systemMessageText, { color: COLORS.text, fontWeight: 'bold' }]}>
              {renderMessageContent(item.content)}
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
            <Text style={[styles.roomNameText, { color: COLORS.warning }]}>{roomName} </Text>
            <Text style={[styles.usernameText, { color: getRoleColor(userRole, username, chatTabs[activeTab]?.id) }]}>{username} </Text>
            <Text style={styles.roleBadgeText}>{getRoleBadgeText(userRole)} </Text>
            <Text style={styles.actionText}>{actionText} </Text>
            <Text style={styles.joinLeaveTime}>({formatTime(typeof item.timestamp === 'string' ? new Date(item.timestamp) : item.timestamp)})</Text>
          </Text>
        </TouchableOpacity>
      );
    }

    // Handle gift messages - Purple semi-transparent bubble with auto-hide
    if (item.type === 'gift') {
      // Check if this gift notification should be hidden
      if (hiddenGiftIds.has(item.id)) {
        return null;
      }

      return (
        <View style={styles.giftNotificationContainer}>
          <View style={styles.giftNotificationBubble}>
            <Text style={styles.giftNotificationText} numberOfLines={1}>
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    // Render support messages differently
    if (item.type === 'support') {
      const senderIsAdmin = item.role === 'admin';
      const senderColor = senderIsAdmin ? COLORS.roleAdmin : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id);

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
                <Text style={{ color: COLORS.text }}>
                  : {renderMessageContent(item.content)}
                </Text>
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Regular message
    const userColor = (item.sender === 'LowCardBot' || item.sender === 'SicboBot' || item.sender === 'BaccaratBot' || item.sender === 'chatme_bot') ? COLORS.success : getRoleColor(item.role, item.sender, chatTabs[activeTab]?.id);
    const contentColor = (item.sender === 'LowCardBot' || item.sender === 'SicboBot' || item.sender === 'BaccaratBot' || item.sender === 'chatme_bot') ? COLORS.info : COLORS.text;
    
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
          
          {/* Card images are now rendered inline via renderMessageContent - no separate image display needed */}
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
            if (gift.image.startsWith('http://') || gift.image.startsWith('https://')) {
              mappedGift.image = { uri: gift.image };
            } else {
              mappedGift.imageUrl = gift.image;
            }
          }

          if (gift.animation) {
            if (gift.animation.startsWith('http://') || gift.animation.startsWith('https://')) {
              mappedGift.animation = { uri: gift.animation };
              mappedGift.videoSource = { uri: gift.animation };
            } else if (gift.animation.includes('hearts-feedback.json')) {
              // Local Lottie file - use require()
              mappedGift.animation = require('../assets/lottie/hearts-feedback.json');
              mappedGift.mediaType = 'lottie';
            } else {
              mappedGift.videoUrl = gift.animation;
            }
          }
          
          // Set mediaType from gift.mediaType if available
          if (gift.mediaType) {
            mappedGift.mediaType = gift.mediaType;
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

          // Send gift directly without confirmation popup
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

              // Send gift via socket for real-time display (no success popup)
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
          colors={[COLORS.primary, COLORS.info]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
              <Ionicons name="arrow-back" size={24} color={COLORS.badgeTextLight} />
            </TouchableOpacity>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: COLORS.badgeTextLight }]}>Chat</Text>
              <Text style={[styles.headerSubtitle, { color: COLORS.textSecondary }]}>No active rooms</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Empty State */}
        <View style={styles.emptyStateContainer}>
          <Ionicons name="chatbubbles-outline" size={80} color={COLORS.iconDefault} />
          <Text style={styles.emptyStateTitle}>No Active Rooms</Text>
          <Text style={styles.emptyStateSubtitle}>Go back to join a room to start chatting</Text>
          <TouchableOpacity
            style={styles.joinRoomButton}
            onPress={() => navigation.navigate('Room' as never)}
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
        colors={chatTabs[activeTab]?.type === 'private' ? [COLORS.warning, COLORS.error] : chatTabs[activeTab]?.isSupport ? [COLORS.success, COLORS.success] : [COLORS.primary, COLORS.info]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color={COLORS.badgeTextLight} />
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
              <Text style={[styles.headerSubtitle, { color: COLORS.badgeTextLight }]}>
                {isSocketConnected ? 'Connected' : 'Connecting...'}
              </Text>
            </View>
          ) : (
            // Regular Room Header
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: COLORS.badgeTextLight }]}>{chatTabs[activeTab]?.title}</Text>
              <Text style={[styles.headerSubtitle, { color: COLORS.badgeTextLight }]}>
                {chatTabs[activeTab]?.type === 'room' ? 'Chatroom' : 'Private Chat'} 
                {!isSocketConnected && ' • Reconnecting...'}
              </Text>
            </View>
          )}

          <View style={styles.headerIcons}>
            {chatTabs[activeTab]?.type === 'private' ? (
              // Private Chat Icons
              <>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color={COLORS.badgeTextLight} />
                </TouchableOpacity>
              </>
            ) : chatTabs[activeTab]?.isSupport ? (
              // Support Chat Icons (e.g., options for support)
              <>
                <TouchableOpacity style={styles.headerIcon}>
                  <Ionicons name="help-circle-outline" size={24} color={COLORS.badgeTextLight} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color={COLORS.badgeTextLight} />
                </TouchableOpacity>
              </>
            ) : (
              // Room Chat Icons
              <>
                <TouchableOpacity style={styles.headerIcon} onPress={handleListPress}>
                  <Ionicons name="list-outline" size={24} color={COLORS.badgeTextLight} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.headerIcon} 
                  onPress={() => setShowRedPacketModal(true)}
                >
                  <Text style={{ fontSize: 24 }}>🧧</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIcon} onPress={handleEllipsisPress}>
                  <Ionicons name="ellipsis-vertical" size={24} color={COLORS.badgeTextLight} />
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
                scrollToBottom(currentRoomId, true);
                setIsUserScrolling(false);
              }
            }}
          >
            <Ionicons
              name={autoScrollEnabled ? "arrow-down-circle" : "arrow-down-circle-outline"}
              size={30}
              color={COLORS.badgeTextLight}
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
                      <Ionicons name="close-circle" size={16} color={COLORS.badgeTextLight} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.emojiButton} onPress={handleEmojiPress}>
              <Ionicons name="happy-outline" size={24} color={COLORS.badgeTextLight} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.giftButton} onPress={() => {
              loadGifts();
              setShowGiftPicker(true);
            }}>
              <Ionicons name="gift-outline" size={24} color={COLORS.error} />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message"
              placeholderTextColor={COLORS.textSecondary}
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
              <Ionicons name="send" size={24} color={COLORS.badgeTextLight} />
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
                  <Ionicons name="person-outline" size={20} color={COLORS.text} />
                  <Text style={styles.menuText}>View Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    Alert.alert('Search Messages', 'Search functionality will be added soon');
                  }}
                >
                  <Ionicons name="search-outline" size={20} color={COLORS.text} />
                  <Text style={styles.menuText}>Search Messages</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowPopupMenu(false);
                    Alert.alert('Clear Chat', 'Clear chat functionality will be added soon');
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.warning} />
                  <Text style={[styles.menuText, { color: COLORS.warning }]}>Clear Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color={COLORS.error} />
                  <Text style={[styles.menuText, { color: COLORS.error }]}>Close Chat</Text>
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
                  <Ionicons name="settings-outline" size={20} color={COLORS.text} />
                  <Text style={styles.menuText}>Support Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color={COLORS.error} />
                  <Text style={[styles.menuText, { color: COLORS.error }]}>End Support Session</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Room Chat Menu Options
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleLeaveRoom}
                >
                  <Ionicons name="exit-outline" size={20} color={COLORS.error} />
                  <Text style={[styles.menuText, { color: COLORS.error }]}>Leave Room</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleRoomInfo}
                >
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.text} />
                  <Text style={styles.menuText}>Info Room</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.lastMenuItem]}
                  onPress={handleRoomManagement}
                >
                  <Ionicons name="settings-outline" size={20} color={COLORS.text} />
                  <Text style={styles.menuText}>Room Management</Text>
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
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.roomInfoContent}>
              <View style={styles.roomInfoItem}>
                <Ionicons name="home-outline" size={20} color={COLORS.textSecondary} />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Room Name</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.title}</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Created Date</Text>
                  <Text style={styles.roomInfoValue}>18 August 2025</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Owner</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.managedBy || 'admin'}</Text>
                </View>
              </View>

              <View style={styles.roomInfoItem}>
                <Ionicons name="shield-outline" size={20} color={COLORS.textSecondary} />
                <View style={styles.roomInfoText}>
                  <Text style={styles.roomInfoLabel}>Moderator</Text>
                  <Text style={styles.roomInfoValue}>{chatTabs[activeTab]?.managedBy || 'admin'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Room Management Component */}
      <RoomManagement
        visible={showRoomManagement}
        onClose={() => setShowRoomManagement(false)}
        roomId={chatTabs[activeTab]?.id || ''}
        roomName={chatTabs[activeTab]?.title || ''}
        currentUser={user}
        socket={socket}
      />

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
                <Ionicons name="close" size={24} color={COLORS.text} />
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
              <Ionicons name="person-outline" size={20} color={COLORS.text} />
              <Text style={styles.participantMenuText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.participantMenuItem}
              onPress={handleOpenChat}
            >
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.text} />
              <Text style={styles.participantMenuText}>Private Chat</Text>
            </TouchableOpacity>

            {(user?.role === 'admin' || user?.role === 'mentor') && (
              <TouchableOpacity
                style={styles.participantMenuItem}
                onPress={handleKickUser}
              >
                <Ionicons name="exit-outline" size={20} color={COLORS.error} />
                <Text style={[styles.participantMenuText, { color: COLORS.error }]}>Kick User</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.participantMenuItem}
              onPress={handleBlockUser}
            >
              <Ionicons name="ban-outline" size={20} color={COLORS.warning} />
              <Text style={[styles.participantMenuText, { color: COLORS.warning }]}>
                {blockedUsers.includes(selectedParticipant?.username) ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>

            {user?.role === 'admin' && (
              <TouchableOpacity
                style={styles.participantMenuItem}
                onPress={handleMuteUser}
              >
                <Ionicons name="volume-mute-outline" size={20} color={COLORS.primary} />
                <Text style={[styles.participantMenuText, { color: COLORS.primary }]}>
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
                  <Ionicons name="remove-circle-outline" size={20} color={COLORS.error} />
                  <Text style={[styles.participantMenuText, { color: COLORS.error }]}>
                    {bannedUsers.includes(selectedParticipant?.username) ? 'Unban User' : 'Ban User'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.participantMenuItem}
                  onPress={handleLockRoom}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={COLORS.error} />
                  <Text style={[styles.participantMenuText, { color: COLORS.error }]}>Lock Room</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.participantMenuItem, styles.lastParticipantMenuItem]}
              onPress={handleReportUser}
            >
              <Ionicons name="flag-outline" size={20} color={COLORS.error} />
              <Text style={[styles.participantMenuText, { color: COLORS.error }]}>Report User</Text>
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
                    <Ionicons name="cloud-upload-outline" size={40} color={COLORS.iconDefault} />
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
            {/* Gift Category Tabs with Close Button */}
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
              <TouchableOpacity 
                onPress={() => setShowGiftPicker(false)}
                style={styles.closeButtonInTab}
              >
                <Ionicons name="close" size={24} color={COLORS.badgeTextLight} />
              </TouchableOpacity>
            </View>

            {/* Coin Balance Display */}
            <View style={styles.coinBalanceDisplay}>
              <View style={styles.coinBalanceRow}>
                <Ionicons name="diamond" size={18} color={COLORS.warning} />
                <Text style={styles.coinBalanceText}>{user?.balance?.toLocaleString() || 0}</Text>
              </View>
            </View>

            <FlatList
              data={activeGiftTab === 'all' ? giftList : giftList.filter(gift => gift.category === 'special' || gift.special)}
              renderItem={({ item: gift, index }) => (
                <View style={styles.newGiftItemContainer}>
                  <TouchableOpacity
                    style={styles.newGiftItem}
                    onPress={() => handleGiftSend(gift)}
                  >
                    <View style={styles.newGiftIconContainer}>
                      {(() => {
                        // Check mediaType first for explicit Lottie/Video
                        if (gift.mediaType === 'lottie' || gift.mediaType === 'video') {
                          const animSource = gift.animation || gift.videoUrl || { uri: gift.imageUrl };
                          
                          if (gift.mediaType === 'lottie') {
                            // For local Lottie files, use the source directly if it's a require() object
                            // For remote URLs, wrap in { uri: ... }
                            let lottieSource = animSource;
                            if (typeof animSource === 'string' && animSource.startsWith('http')) {
                              lottieSource = { uri: animSource };
                            }
                            
                            return (
                              <LottieView
                                source={lottieSource}
                                autoPlay
                                loop
                                style={styles.giftImage}
                              />
                            );
                          } else {
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
                          }
                        }
                        
                        // Fallback: Check for animation/videoUrl (legacy detection)
                        if (gift.animation || gift.videoUrl) {
                          const animSource = gift.animation || { uri: gift.videoUrl };
                          const animStr = gift.animation?.uri || gift.videoUrl || (typeof gift.animation === 'string' ? gift.animation : '');
                          
                          // Detect Lottie by file extension
                          const isLottie = animStr && (
                            animStr.toLowerCase().includes('.json') || 
                            animStr.toLowerCase().includes('lottie')
                          );
                          
                          // Detect video by file extension
                          const isVideo = animStr && (
                            animStr.toLowerCase().includes('.mp4') || 
                            animStr.toLowerCase().includes('.webm') || 
                            animStr.toLowerCase().includes('.mov')
                          );
                          
                          if (isLottie) {
                            let lottieSource = animSource;
                            if (typeof animSource === 'string' && animSource.startsWith('http')) {
                              lottieSource = { uri: animSource };
                            }
                            
                            return (
                              <LottieView
                                source={lottieSource}
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
                          }
                        }
                        
                        // Check for static image
                        if (gift.image || gift.imageUrl) {
                          return (
                            <Image 
                              source={gift.image || { uri: gift.imageUrl }} 
                              style={styles.giftImage} 
                              contentFit="contain"
                              cachePolicy="memory-disk"
                            />
                          );
                        }
                        
                        // Fallback: Show icon emoji
                        return <Text style={styles.newGiftIcon}>{gift.icon}</Text>;
                      })()}
                      {gift.type === 'animated' && (
                        <View style={styles.animatedBadge}>
                          <Text style={styles.animatedBadgeText}>✨</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.newGiftName} numberOfLines={1}>{gift.name}</Text>
                    <View style={styles.giftPriceContainer}>
                      <Ionicons name="diamond-outline" size={12} color={COLORS.warning} />
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
              numColumns={3}
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
          <View style={styles.giftPickerModal}>
            <View style={styles.giftPickerHeader}>
              <Text style={styles.giftPickerTitle}>
                Send {selectedGiftForUser?.name} {selectedGiftForUser?.icon} to User
              </Text>
              <TouchableOpacity onPress={() => setShowUserGiftPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
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
              <Ionicons name="copy-outline" size={20} color={COLORS.text} />
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
              <Ionicons name="at-outline" size={20} color={COLORS.text} />
              <Text style={styles.messageMenuText}>Reply to User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.messageMenuItem, styles.lastMessageMenuItem]}
              onPress={() => {
                setShowMessageMenu(false);
                setSelectedMessage(null);
              }}
            >
              <Ionicons name="close-outline" size={20} color={COLORS.textSecondary} />
              <Text style={[styles.messageMenuText, { color: COLORS.textSecondary }]}>Cancel</Text>
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
            {/* Lottie Animation Support - Perfect Transparency */}
            {(() => {
              const animationData = activeGiftAnimation.animation || activeGiftAnimation.videoSource;
              const animStr = animationData?.uri || activeGiftAnimation.videoUrl || (typeof animationData === 'string' ? animationData : '');
              const isLottie = activeGiftAnimation.mediaType === 'lottie' || (
                animStr && 
                (animStr.toLowerCase().includes('.json') || animStr.toLowerCase().includes('lottie'))
              );
              
              if (isLottie && animationData) {
                const lottieSource = typeof animationData === 'string' ? { uri: animationData } : animationData;
                return (
                  <LottieView
                    source={lottieSource}
                    autoPlay
                    loop={false}
                    style={styles.fullScreenLottie}
                    renderMode="AUTOMATIC"
                    hardwareAccelerationAndroid
                    onAnimationFinish={() => {
                      setTimeout(() => {
                        Animated.parallel([
                          Animated.timing(giftScaleAnim, {
                            toValue: 1.1,
                            duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                            useNativeDriver: true,
                          }),
                          Animated.timing(giftOpacityAnim, {
                            toValue: 0,
                            duration: GIFT_ANIMATION_DURATION.FADE_OUT,
                            easing: Easing.bezier(0.33, 0, 0.67, 1),
                            useNativeDriver: true,
                          }),
                        ]).start(() => {
                          setActiveGiftAnimation(null);
                        });
                      }, 500);
                    }}
                  />
                );
              }
              return null;
            })()}

            {/* Full Screen Video Effect */}
            {(() => {
              const animationData = activeGiftAnimation.animation || activeGiftAnimation.videoSource;
              const animStr = animationData?.uri || activeGiftAnimation.videoUrl || (typeof animationData === 'string' ? animationData : '');
              const isLottie = activeGiftAnimation.mediaType === 'lottie' || (
                animStr && 
                (animStr.toLowerCase().includes('.json') || animStr.toLowerCase().includes('lottie'))
              );
              const isVideo = !isLottie && (activeGiftAnimation.mediaType === 'video' || (
                animStr && 
                (animStr.toLowerCase().includes('.mp4') || 
                 animStr.toLowerCase().includes('.webm') || 
                 animStr.toLowerCase().includes('.mov'))
              ));
              
              if (isVideo && animationData) {
                const videoSource = typeof animationData === 'string' ? { uri: animationData } : animationData;
                return (
                  <Video
                    ref={giftVideoRef}
                    source={videoSource}
                    style={styles.fullScreenVideo}
                    resizeMode={'cover' as any}
                    shouldPlay
                    isLooping={false}
                    isMuted={false}
                    volume={0.7}
                    onPlaybackStatusUpdate={(status: any) => {
                      if (status.didJustFinish) {
                        setTimeout(() => {
                          Animated.parallel([
                            Animated.timing(giftScaleAnim, {
                              toValue: 1.1,
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
                        }, 1500);
                      }
                    }}
                  />
                );
              }
              return null;
            })()}

            {/* Small Static Image Effect - Only show if NO animation at all */}
            {(() => {
              const animationData = activeGiftAnimation.animation || activeGiftAnimation.videoSource;
              const animStr = animationData?.uri || activeGiftAnimation.videoUrl || (typeof animationData === 'string' ? animationData : '');
              
              const hasLottie = activeGiftAnimation.mediaType === 'lottie' || (
                animStr && 
                (animStr.toLowerCase().includes('.json') || animStr.toLowerCase().includes('lottie'))
              );
              
              const hasVideo = activeGiftAnimation.mediaType === 'video' || (
                animStr && 
                (animStr.toLowerCase().includes('.mp4') || 
                 animStr.toLowerCase().includes('.webm') || 
                 animStr.toLowerCase().includes('.mov'))
              );
              
              const hasAnyAnimation = activeGiftAnimation.animation || activeGiftAnimation.videoSource || activeGiftAnimation.videoUrl;
              
              // ONLY show small image if there's absolutely NO animation (video/lottie/gif)
              if (activeGiftAnimation.image && !hasVideo && !hasLottie && !hasAnyAnimation) {
                return (
                  <View style={styles.smallGiftContainer}>
                    <Image 
                      source={activeGiftAnimation.image} 
                      style={styles.smallGiftImage}
                      resizeMode="contain"
                    />
                  </View>
                );
              }
              return null;
            })()}

            {/* Fullscreen GIF layer for non-video, non-lottie animations */}
            {(() => {
              const animationData = activeGiftAnimation.animation;
              const animStr = animationData?.uri || activeGiftAnimation.videoUrl || (typeof animationData === 'string' ? animationData : '');
              const isLottie = activeGiftAnimation.mediaType === 'lottie' || (
                animStr && 
                (animStr.toLowerCase().includes('.json') || animStr.toLowerCase().includes('lottie'))
              );
              const isVideo = activeGiftAnimation.mediaType === 'video' || (
                animStr && 
                (animStr.toLowerCase().includes('.mp4') || 
                 animStr.toLowerCase().includes('.webm') || 
                 animStr.toLowerCase().includes('.mov'))
              );
              
              if (animationData && !isVideo && !isLottie) {
                const gifSource = typeof animationData === 'string' ? { uri: animationData } : animationData;
                return (
                  <Image 
                    source={gifSource} 
                    style={styles.fullScreenGif}
                    resizeMode="cover"
                  />
                );
              }
              return null;
            })()}

            {/* Fallback emoji/icon layer (small) - show if no animation/image or as additional layer */}
            {!activeGiftAnimation.animation && !activeGiftAnimation.image && activeGiftAnimation.icon && (
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

      {/* Red Packet Modal */}
      <RedPacketModal
        visible={showRedPacketModal}
        onClose={() => setShowRedPacketModal(false)}
        onSend={handleSendRedPacket}
        userBalance={userBalance}
      />

      {/* Red Envelope Animation */}
      {redPacketData && (
        <RedEnvelopeAnimation
          packet={redPacketData}
          onClaim={handleClaimRedPacket}
          onClose={() => setRedPacketData(null)}
          hasUserClaimed={claimedPackets.includes(redPacketData.id)}
        />
      )}
    </SafeAreaView>
  );
}

const createThemedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.text,
    marginTop: 20,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  privateChatHistory: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  privateChatSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  emptyPrivateChats: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyPrivateChatsText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 15,
  },
  emptyPrivateChatsSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
    color: COLORS.badgeTextLight,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.avatarOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.badgeTextLight,
  },
  privateChatInfo: {
    flex: 1,
  },
  privateChatName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.badgeTextLight,
  },
  privateChatStatus: {
    fontSize: 14,
    color: COLORS.textOverlay,
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
    backgroundColor: COLORS.overlayLight,
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: COLORS.primary,
  },
  unreadIndicator: {
    backgroundColor: COLORS.roleAdmin,
  },
  tabNavigation: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    backgroundColor: COLORS.background,
  },
  activeTabNavItem: {
    backgroundColor: COLORS.primary,
  },
  tabNavText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  activeTabNavText: {
    color: COLORS.badgeTextLight,
  },
  roomDescriptionContainer: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  roomDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  managedByText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  roomNameHighlight: {
    color: COLORS.error,
    fontWeight: 'bold',
  },
  currentlyInRoomContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  currentlyInRoomText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  currentlyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  participantInRoomName: {
    fontSize: 13,
    fontWeight: '600',
  },
  participantSeparator: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  noParticipantsInRoom: {
    fontSize: 13,
    color: COLORS.textSecondary,
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
    marginBottom: 4,
    paddingHorizontal: 0,
  },
  supportMessageContainer: {
    marginBottom: 6,
    paddingHorizontal: 0,
  },
  supportMessageBubble: {
    backgroundColor: COLORS.roleUserBg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
    borderRadius: 8,
    padding: 8,
  },
  botCommandContainer: {
    backgroundColor: COLORS.successBadgeBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
    borderRadius: 8,
    marginVertical: 2,
  },
  systemCommandContainer: {
    backgroundColor: COLORS.background,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.roleAdminBg,
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
    color: COLORS.badgeTextLight,
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
    color: COLORS.badgeTextLight,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 6,
    alignSelf: 'flex-start',
  },
  messageContent: {
    fontSize: 14,
    color: COLORS.text,
  },
  inlineEmojiImage: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  cardImageWrapper: {
    backgroundColor: 'transparent',
  },
  cardInlineImage: {
    width: 20,
    height: 28,
    resizeMode: 'contain',
  },
  diceImageWrapper: {
    backgroundColor: 'transparent',
  },
  diceInlineImage: {
    width: 32,
    height: 32,
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
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.background,
    alignSelf: 'flex-start',
  },
  inputContainer: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    elevation: 3,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    marginHorizontal: 4,
  },
  emojiButton: {
    padding: 10,
    backgroundColor: COLORS.warning,
    borderRadius: 20,
    marginRight: 8,
    marginLeft: 4,
  },
  giftButton: {
    marginRight: 12,
  },
  emojiPreviewContainer: {
    backgroundColor: COLORS.cardSubtle,
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
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emojiPreviewImage: {
    width: 32,
    height: 32,
  },
  emojiPreviewRemoveButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    backgroundColor: COLORS.error,
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginRight: 4,
    elevation: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupMenu: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    minWidth: 180,
    elevation: 5,
    shadowColor: COLORS.shadow,
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
    borderBottomColor: COLORS.border,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
    fontWeight: '500',
  },
  roomInfoModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: COLORS.shadow,
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
    borderBottomColor: COLORS.border,
  },
  roomInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
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
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  roomInfoValue: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  participantsModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: COLORS.shadow,
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
    borderBottomColor: COLORS.border,
  },
  participantsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },  participantsList: {
    maxHeight: 400,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    elevation: 1,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: COLORS.badgeTextLight,
    elevation: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  participantAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.badgeTextLight,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  participantRole: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  participantStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  participantStatusText: {
    fontSize: 12,
    color: COLORS.badgeTextLight,
    fontWeight: '500',
  },
  noParticipants: {
    padding: 40,
    alignItems: 'center',
  },
  noParticipantsText: {
    fontSize: 16,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    elevation: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emojiPickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  emojiPickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
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
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyEmojiSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  joinRoomButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
  },
  joinRoomButtonText: {
    color: COLORS.badgeTextLight,
    fontSize: 16,
    fontWeight: '600',
  },
  // Participant context menu styles
  participantContextMenu: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    minWidth: 200,
    elevation: 5,
    shadowColor: COLORS.shadow,
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
    borderBottomColor: COLORS.border,
  },
  participantMenuAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantMenuAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.badgeTextLight,
  },
  participantMenuName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  participantMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lastParticipantMenuItem: {
    borderBottomWidth: 0,
  },
  participantMenuText: {
    fontSize: 16,
    color: COLORS.text,
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
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  blockedIndicator: {
    fontSize: 12,
    color: COLORS.warning,
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
    color: COLORS.textSecondary,
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
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  joinLeaveTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  // Gift notification styles
  giftNotificationContainer: {
    alignItems: 'flex-start',
    marginVertical: 4,
    paddingHorizontal: 0,
  },
  giftNotificationBubble: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)', // Purple semi-transparent
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  giftNotificationText: {
    fontSize: 13,
    color: '#8B5CF6', // Purple text
    fontWeight: '600',
    textAlign: 'left',
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
    color: COLORS.text, // Dark text for light background visibility
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  commandContentText: {
    fontSize: 14,
    color: COLORS.text, // Dark text for light background visibility
  },
  systemMessageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.successBadgeBg,
    borderRadius: 8,
    marginHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  systemMessageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  systemMessageText: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '500',
    flex: 1,
    lineHeight: 20,
    marginRight: 8,
  },
  broadcastMessageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.successSubtle,
    borderRadius: 8,
    marginHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  broadcastMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  broadcastMessageText: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '600',
    lineHeight: 20,
  },
  unreadBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.roleAdmin,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: COLORS.badgeTextLight,
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Gift Picker Styles
  giftModalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  giftPickerModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '50%',
    paddingBottom: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  giftPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  giftPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  giftCategoryTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
  },
  closeButtonInTab: {
    padding: 4,
    marginLeft: 8,
  },
  sendToAllContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sendToAllToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendToAllText: {
    fontSize: 14,
    color: COLORS.text,
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
    borderBottomColor: COLORS.warning,
    borderRadius: 0,
  },
  categoryTabText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  activeCategoryTabText: {
    color: COLORS.warning,
    fontWeight: 'bold',
  },
  coinBalanceContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    color: COLORS.warning,
  },
  coinDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
    flex: 1,
    maxWidth: '33.33%',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  newGiftItem: {
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    position: 'relative',
    minHeight: 140,
  },
  selectedGiftItem: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
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
    backgroundColor: COLORS.warning,
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
    backgroundColor: COLORS.warning,
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
    backgroundColor: COLORS.warning,
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
    backgroundColor: COLORS.success,
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
    color: COLORS.text,
  },
  newGiftIconContainer: {
    marginTop: 16,
    marginBottom: 12,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  giftImage: {
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
  },
  newGiftIcon: {
    fontSize: 48,
    color: COLORS.text,
  },
  newGiftName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  newGiftPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  giftGridContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
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
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.borderOverlay,
    shadowColor: COLORS.shadow,
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
    backgroundColor: COLORS.primary,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendToUserButton: {
    flex: 1,
    backgroundColor: COLORS.info,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  giftActionText: {
    color: COLORS.textEmphasis,
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
    backgroundColor: COLORS.warning,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animatedBadgeText: {
    fontSize: 10,
    color: COLORS.text,
  },
  giftName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textEmphasis,
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
    color: COLORS.warning,
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
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 10,
  },
  // Styles for userGiftRole, etc.
  userGiftRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    borderBottomColor: COLORS.border,
  },
  userGiftInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userGiftName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.badgeTextLight,
  },
  selfLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  fullScreenLottie: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent', // Perfect transparency support
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
    backgroundColor: COLORS.avatarOverlay,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: COLORS.borderOverlay,
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
    backgroundColor: COLORS.overlayLight,
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
    color: COLORS.badgeTextLight,
    marginBottom: 5,
    textAlign: 'center',
    textShadowColor: COLORS.overlayDark,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  giftDescription: {
    fontSize: 16,
    color: COLORS.badgeTextLight,
    textAlign: 'center',
    opacity: 0.9,
    textShadowColor: COLORS.overlayDark,
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  coinBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBalanceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.warning,
    marginLeft: 6,
  },
  // User Tag Menu Styles
  userTagModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingBottom: 120,
  },
  userTagMenu: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    maxHeight: 200,
    elevation: 5,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  userTagHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  userTagTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
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
    borderBottomColor: COLORS.border,
  },
  userTagInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userTagName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  userTagRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.success,
  },
  disconnectedDot: {
    backgroundColor: COLORS.error,
  },
  reconnectingDot: {
    backgroundColor: COLORS.warning,
  },
  // Message Context Menu Styles
  messageContextMenu: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    minWidth: 180,
    elevation: 5,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  messageMenuHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  messageMenuTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },
  messageMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lastMessageMenuItem: {
    borderBottomWidth: 0,
  },
  messageMenuText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
    fontWeight: '500',
  },
  // Mention Text Style
  mentionText: {
    color: COLORS.info,
    fontWeight: '600',
  },
  // Gift Message Styles
  giftMessageContainer: {
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  giftMessageBubble: {
    backgroundColor: COLORS.successBadgeBg,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  giftImagePreviewContainer: {
    marginTop: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  giftImagePreview: {
    width: 64,
    height: 64,
    backgroundColor: 'transparent',
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
    color: COLORS.text,
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
    color: COLORS.badgeTextLight,
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
    color: COLORS.success,
    fontWeight: '500',
  },
});