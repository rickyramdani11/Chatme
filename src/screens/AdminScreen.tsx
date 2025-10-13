import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Animated,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../utils/apiConfig';
import AdminTransferHistoryModal from '../components/AdminTransferHistoryModal';

const { width: screenWidth } = Dimensions.get('window');

interface Gift {
  id: string;
  name: string;
  icon: string;
  animation?: string;
  price: number;
  type: string;
  category?: string;
  image?: string;
  mediaType?: string;
  thumbnailUrl?: string;
  duration?: number;
}

interface User {
  id: string;
  username: string;
  role: string;
  email?: string;
  verified?: boolean;
}

interface MenuItem {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
}

interface UserStatus {
  id: string;
  username: string;
  status: string;
  role: string;
  email?: string;
  phone?: string;
  credits?: number;
  device?: string;
  ip?: string;
  location?: string;
  lastLogin?: string;
}

interface Room {
  id: string;
  name: string;
  description?: string;
  members?: number;
  maxMembers?: number;
  createdBy?: string;
  managedBy?: string;
  createdAt?: string;
}

interface BannedDevice {
  id: string;
  userId?: string;
  type: string;
  target: string;
  reason?: string;
  bannedBy?: string;
  bannedAt?: string;
}

interface Banner {
  id: string;
  imageUrl: string;
  title: string;
  description?: string;
  displayOrder?: number;
  clickCount?: number;
}

interface Ticket {
  id: string;
  ticketId: string;
  userId: string;
  username?: string;
  subject: string;
  description: string;
  status: string;
  createdAt?: string;
  messages?: any[];
  category?: string;
  priority?: string;
}

interface Frame {
  id: string;
  name: string;
  image?: string;
  price: number;
  durationDays?: number;
  description?: string;
}

interface CreditHistory {
  id: string;
  type: string;
  amount: number;
  otherParty?: string;
  createdAt?: string;
}

interface Withdrawal {
  id: string;
  userId: number;
  username: string;
  email: string;
  amountUsd: number;
  amountCoins: number;
  netAmountIdr: number;
  accountType: string;
  accountDetails: any;
  status: string;
  createdAt: string;
  processedAt?: string;
  notes?: string;
}

// Super Admin IDs yang boleh akses fitur "Tambah Credit"
const SUPER_ADMIN_IDS = [1, 4]; // ID: 1 (asu), 4 (chatme)

export default function AdminScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [userStats, setUserStats] = useState<any>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-screenWidth * 0.75)).current;

  // User search states
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Gift edit states
  const [editingGift, setEditingGift] = useState<Gift | null>(null);
  const [editGiftPrice, setEditGiftPrice] = useState('');
  const [editGiftName, setEditGiftName] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Admin credit states
  const [adminCreditUsername, setAdminCreditUsername] = useState('');
  const [adminCreditAmount, setAdminCreditAmount] = useState('');
  const [adminCreditReason, setAdminCreditReason] = useState('');
  const [adminCreditLoading, setAdminCreditLoading] = useState(false);

  // User status states
  const [userStatusList, setUserStatusList] = useState<UserStatus[]>([]);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState<UserStatus | null>(null);
  const [userCreditHistory, setUserCreditHistory] = useState<CreditHistory[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  // Room management states
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [searchRoomText, setSearchRoomText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomDescription, setEditRoomDescription] = useState('');
  const [editRoomMaxMembers, setEditRoomMaxMembers] = useState(25);
  const [editRoomMaxMembersInput, setEditRoomMaxMembersInput] = useState('25');
  const [editRoomOwner, setEditRoomOwner] = useState('');
  const [editRoomCategory, setEditRoomCategory] = useState<'social' | 'game'>('social');
  const [editingRoom, setEditingRoom] = useState(false);

  // Ban management states
  const [bannedDevicesList, setBannedDevicesList] = useState<BannedDevice[]>([]);
  const [banLoading, setBanLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({
    brand: 'Unknown',
    modelName: 'Unknown Device',
    deviceType: 'Unknown'
  });

  // Form states for adding gift
  const [itemName, setItemName] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadedGiftImage, setUploadedGiftImage] = useState<any>(null);

  // Banner management states
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerDescription, setBannerDescription] = useState('');
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerDisplayOrder, setBannerDisplayOrder] = useState('0');
  const [uploadedBannerImage, setUploadedBannerImage] = useState<any>(null);

  // Support tickets states
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [ticketReply, setTicketReply] = useState('');
  const [showTicketDetailModal, setShowTicketDetailModal] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [ticketStats, setTicketStats] = useState<any>(null);

  // Frame management states
  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [uploadedFrameImage, setUploadedFrameImage] = useState<any>(null);
  const [frameName, setFrameName] = useState('');
  const [frameDescription, setFrameDescription] = useState('');
  const [framePrice, setFramePrice] = useState('');
  const [frameDurationDays, setFrameDurationDays] = useState('14');

  // Create special account states
  const [createAccountId, setCreateAccountId] = useState('');
  const [createAccountUsername, setCreateAccountUsername] = useState('');
  const [createAccountEmail, setCreateAccountEmail] = useState('');
  const [createAccountPassword, setCreateAccountPassword] = useState('');
  const [createAccountLoading, setCreateAccountLoading] = useState(false);

  // Change user email states
  const [changeEmailUsername, setChangeEmailUsername] = useState('');
  const [changeEmailNewEmail, setChangeEmailNewEmail] = useState('');
  const [changeEmailLoading, setChangeEmailLoading] = useState(false);

  // Reset user password states
  const [resetPasswordUsername, setResetPasswordUsername] = useState('');
  const [resetPasswordNewPassword, setResetPasswordNewPassword] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Transfer history modal state
  const [showTransferHistoryModal, setShowTransferHistoryModal] = useState(false);

  // Gift report states
  const [reportMonth, setReportMonth] = useState('');
  const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Withdrawal management states
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false);

  // Check if current user is super admin
  const isSuperAdmin = user?.id && SUPER_ADMIN_IDS.includes(Number(user.id));

  const allMenuItems: MenuItem[] = [
    {
      id: 'users',
      title: 'User Online',
      icon: 'people-outline',
      color: '#4ECDC4',
      description: 'Statistik pengguna dan user online'
    },
    {
      id: 'gift',
      title: 'Kelola Gift',
      icon: 'gift-outline',
      color: '#FF6B35',
      description: 'Tambah dan kelola gift virtual'
    },
    {
      id: 'frames',
      title: 'Kelola Frame Avatar',
      icon: 'aperture-outline',
      color: '#9C27B0',
      description: 'Tambah dan kelola frame avatar'
    },
    {
      id: 'banners',
      title: 'Kelola Banner',
      icon: 'image-outline',
      color: '#E91E63',
      description: 'Tambah dan kelola banner iklan'
    },
    {
      id: 'rooms',
      title: 'Kelola Room',
      icon: 'chatbubbles-outline',
      color: '#673AB7',
      description: 'Kelola room chat dan pengaturan'
    },
    {
      id: 'manage-users',
      title: 'Kelola User',
      icon: 'people-outline',
      color: '#21963F',
      description: 'Cari dan promosikan user'
    },
    {
      id: 'admin-credit',
      title: 'Tambah Credit',
      icon: 'add-circle-outline',
      color: '#FF9800',
      description: 'Tambah credit tanpa batasan (Super Admin Only)'
    },
    {
      id: 'status',
      title: 'Status User',
      icon: 'analytics-outline',
      color: '#F44336',
      description: 'Monitor status dan aktivitas user'
    },
    {
      id: 'ban-manage',
      title: 'Ban Management',
      icon: 'shield-outline',
      color: '#D32F2F',
      description: 'Kelola banned devices dan IP address'
    },
    {
      id: 'support-tickets',
      title: 'Support Tickets',
      icon: 'mail-outline',
      color: '#2196F3',
      description: 'Kelola support tickets dari user'
    },
    {
      id: 'change-email',
      title: 'Ganti Email User',
      icon: 'mail-open-outline',
      color: '#00BCD4',
      description: 'Ganti email user yang lupa akses (Super Admin Only)'
    },
    {
      id: 'reset-password',
      title: 'Reset Password User',
      icon: 'key-outline',
      color: '#FF5722',
      description: 'Reset password user yang lupa (Super Admin Only)'
    },
    {
      id: 'transfer-history',
      title: 'Lihat History Transfer',
      icon: 'receipt-outline',
      color: '#4a90e2',
      description: 'Lihat history transfer credit admin (Super Admin Only)'
    },
    {
      id: 'gift-report',
      title: 'Download Laporan Gift',
      icon: 'download-outline',
      color: '#009688',
      description: 'Download laporan gift earnings (CSV format)'
    },
    {
      id: 'withdrawals',
      title: 'Withdrawal Requests',
      icon: 'cash-outline',
      color: '#4CAF50',
      description: 'Proses withdrawal request manual'
    }
  ];

  // Filter menu: hide super admin features if not super admin
  const menuItems = allMenuItems.filter(item => {
    if (item.id === 'admin-credit' || item.id === 'change-email' || item.id === 'reset-password' || item.id === 'transfer-history') {
      return isSuperAdmin;
    }
    return true;
  });

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      Alert.alert(
        'Access Denied',
        'You do not have admin privileges to access this screen.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ],
        { cancelable: false }
      );
      return;
    }
  }, [user, navigation]);

  useEffect(() => {
    if (token && user?.role === 'admin') {
      loadGifts();
      loadDeviceInfo();
      if (activeTab === 'users') {
        loadUserStats();
      }
      if (activeTab === 'status') {
        loadUserStatus();
      }
      if (activeTab === 'ban-manage') {
        loadUserStatus();
        loadBannedDevices();
      }
      if (activeTab === 'rooms') {
        loadRooms();
      }
      if (activeTab === 'banners') {
        loadBanners();
      }
      if (activeTab === 'frames') {
        loadFrames();
      }
      if (activeTab === 'support-tickets') {
        loadSupportTickets();
        loadTicketStats();
      }
      if (activeTab === 'withdrawals') {
        loadWithdrawals();
      }
    }
  }, [token, activeTab, user]);

  useEffect(() => {
    if (activeTab === 'support-tickets' && token && user?.role === 'admin') {
      loadSupportTickets();
    }
  }, [ticketStatusFilter]);

  const loadDeviceInfo = async () => {
    try {
      const brand = Device.brand || 'Unknown';
      const modelName = Device.modelName || 'Unknown Device';
      const deviceType = await Device.getDeviceTypeAsync();

      setDeviceInfo({
        brand,
        modelName,
        deviceType: deviceType === Device.DeviceType.PHONE ? 'Phone' : 
                   deviceType === Device.DeviceType.TABLET ? 'Tablet' : 
                   deviceType === Device.DeviceType.DESKTOP ? 'Desktop' : 'Unknown'
      });
    } catch (error) {
      console.error('Error loading device info:', error);
    }
  };

  const toggleSideMenu = () => {
    const toValue = showSideMenu ? -screenWidth * 0.75 : 0;
    setShowSideMenu(!showSideMenu);

    Animated.timing(slideAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const selectMenuItem = (itemId: string) => {
    if (itemId === 'transfer-history') {
      setShowTransferHistoryModal(true);
      toggleSideMenu();
    } else {
      setActiveTab(itemId);
      toggleSideMenu();
    }
  };

  const loadUserStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/user-stats`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserStats(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to load user stats: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
      Alert.alert('Error', 'Network error loading user stats');
    }
  };

  const loadGifts = async () => {
    try {
      console.log('Loading gifts with token:', token ? 'Present' : 'Missing');
      const response = await fetch(`${API_BASE_URL}/admin/gifts`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Gifts response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Gifts loaded:', data.length);
        setGifts(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load gifts:', response.status, errorData);
        Alert.alert('Error', `Failed to load gifts: ${response.status} ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading gifts:', error);
      Alert.alert('Error', 'Network error loading gifts');
    }
  };

  const loadFrames = async () => {
    try {
      setFramesLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/frames`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Frames loaded:', data.length);
        setFrames(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load frames:', response.status, errorData);
        Alert.alert('Error', `Failed to load frames: ${response.status} ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading frames:', error);
      Alert.alert('Error', 'Network error loading frames');
    } finally {
      setFramesLoading(false);
    }
  };

  const handleFrameImageUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload frame image files.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['png', 'gif'];

        if (!allowedExtensions.includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG or GIF files only for frames.');
          return;
        }

        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the image file. Please try again.');
          return;
        }

        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        const maxSize = 5 * 1024 * 1024;

        if (fileSizeInBytes > maxSize) {
          Alert.alert('File too large', 'Please select an image smaller than 5MB.');
          return;
        }

        setUploadedFrameImage({
          uri: asset.uri,
          base64: asset.base64,
          type: `image/${fileExtension}`,
          name: `frame_${Date.now()}.${fileExtension}`,
        });

        Alert.alert('Success', 'Frame image selected successfully.');
      }
    } catch (error) {
      console.error('Error picking frame image:', error);
      Alert.alert('Error', 'Failed to pick frame image');
    }
  };

  const handleAddFrame = async () => {
    if (!frameName.trim()) {
      Alert.alert('Error', 'Frame name is required');
      return;
    }
    if (!framePrice.trim()) {
      Alert.alert('Error', 'Frame price is required');
      return;
    }
    if (!uploadedFrameImage || !uploadedFrameImage.base64) {
      Alert.alert('Error', 'Frame image is required');
      return;
    }

    setFramesLoading(true);
    try {
      const requestBody = {
        name: frameName.trim(),
        description: frameDescription.trim() || '',
        price: parseInt(framePrice),
        durationDays: parseInt(frameDurationDays) || 14,
        frameImage: uploadedFrameImage.base64,
        imageType: uploadedFrameImage.type,
        imageName: uploadedFrameImage.name,
      };

      const response = await fetch(`${API_BASE_URL}/admin/frames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        Alert.alert('Success', 'Frame added successfully with Cloudinary upload');
        setFrameName('');
        setFrameDescription('');
        setFramePrice('');
        setFrameDurationDays('14');
        setUploadedFrameImage(null);
        loadFrames();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add frame');
      }
    } catch (error) {
      console.error('Error adding frame:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to add frame');
    } finally {
      setFramesLoading(false);
    }
  };

  const handleEditFrame = async (frame: any) => {
    setEditingFrame(frame);
    setFrameName(frame.name);
    setFrameDescription(frame.description || '');
    setFramePrice(frame.price.toString());
    setFrameDurationDays(frame.duration_days?.toString() || '14');
    Alert.alert('Edit Frame', 'Update frame details in the form above and submit');
  };

  const handleUpdateFrame = async () => {
    if (!editingFrame) return;
    
    setFramesLoading(true);
    try {
      const requestBody: any = {
        name: frameName.trim(),
        description: frameDescription.trim() || '',
        price: parseInt(framePrice),
        durationDays: parseInt(frameDurationDays) || 14,
      };

      if (uploadedFrameImage && uploadedFrameImage.base64) {
        requestBody.frameImage = uploadedFrameImage.base64;
        requestBody.imageType = uploadedFrameImage.type;
        requestBody.imageName = uploadedFrameImage.name;
      }

      const response = await fetch(`${API_BASE_URL}/admin/frames/${editingFrame.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        Alert.alert('Success', 'Frame updated successfully');
        setFrameName('');
        setFrameDescription('');
        setFramePrice('');
        setFrameDurationDays('14');
        setUploadedFrameImage(null);
        setEditingFrame(null);
        loadFrames();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update frame');
      }
    } catch (error) {
      console.error('Error updating frame:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to update frame');
    } finally {
      setFramesLoading(false);
    }
  };

  const handleDeleteFrame = async (frameId: number) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this frame?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setFramesLoading(true);
            try {
              const response = await fetch(`${API_BASE_URL}/admin/frames/${frameId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Success', 'Frame deleted successfully');
                loadFrames();
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete frame');
              }
            } catch (error) {
              console.error('Error deleting frame:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to delete frame');
            } finally {
              setFramesLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleFileUpload = async () => {
    try {
      // Use DocumentPicker to support JSON files for Lottie animations
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'application/json'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const fileExtension = asset.name.split('.').pop()?.toLowerCase();
      const allowedExtensions = ['gif', 'mp4', 'webm', 'mov', 'json'];

      if (!allowedExtensions.includes(fileExtension || '')) {
        Alert.alert('Invalid file type', 'Please select GIF, video files (MP4, WebM, MOV), or JSON (Lottie) files only.');
        return;
      }

      // Handle JSON Lottie files
      if (fileExtension === 'json') {
        try {
          const FileSystem = require('expo-file-system');
          
          const fileContent = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          // Validate JSON
          const jsonData = JSON.parse(fileContent);
          
          // Check if it's a valid Lottie JSON (has required properties)
          if (!jsonData.v || !jsonData.layers) {
            Alert.alert('Invalid Lottie file', 'The JSON file does not appear to be a valid Lottie animation.');
            return;
          }

          const base64Data = btoa(fileContent);
          const fileSizeInBytes = asset.size || 0;
          const maxLottieSize = 2 * 1024 * 1024; // 2MB for Lottie JSON

          if (fileSizeInBytes > maxLottieSize) {
            Alert.alert('File too large', 'Please select a Lottie JSON file smaller than 2MB.');
            return;
          }

          setSelectedFile({
            uri: asset.uri,
            base64: base64Data,
            type: 'application/json',
            name: asset.name || `lottie_${Date.now()}.json`,
            extension: 'json',
            isAnimated: true,
            duration: null,
            width: jsonData.w || 0,
            height: jsonData.h || 0
          });

          console.log('Lottie JSON file selected:', {
            name: asset.name,
            size: fileSizeInBytes,
            type: 'application/json',
            isAnimated: true,
            lottieVersion: jsonData.v
          });

          Alert.alert('Success', 'Lottie animation file selected successfully.');
          return;
        } catch (error) {
          console.error('Error reading Lottie JSON file:', error);
          Alert.alert('Error', 'Failed to read Lottie JSON file. Make sure it\'s a valid Lottie animation.');
          return;
        }
      }

      // Handle video and GIF files
      const isVideo = ['mp4', 'webm', 'mov'].includes(fileExtension || '');
      const FileSystem = require('expo-file-system');
      
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileSizeInBytes = (base64Data.length * 3) / 4;
      const maxSize = isVideo ? 15 * 1024 * 1024 : 5 * 1024 * 1024; // 15MB for video, 5MB for GIF

      if (fileSizeInBytes > maxSize) {
        Alert.alert('File too large', `Please select a ${isVideo ? 'video' : 'file'} smaller than ${isVideo ? '15MB' : '5MB'}.`);
        return;
      }

      const contentType = isVideo ? `video/${fileExtension}` : `image/${fileExtension}`;

      setSelectedFile({
        uri: asset.uri,
        base64: base64Data,
        type: contentType,
        name: asset.name || `gift_animated_${Date.now()}.${fileExtension}`,
        extension: fileExtension || 'mp4',
        isAnimated: true,
        duration: null,
        width: 0,
        height: 0
      });

      console.log('Animated file selected:', {
        name: asset.name,
        type: contentType,
        size: fileSizeInBytes,
        isAnimated: true
      });

      Alert.alert('Success', `${isVideo ? 'Video' : 'GIF'} file selected successfully.`);

    } catch (error) {
      console.error('Error picking animated file:', error);
      Alert.alert('Error', 'Failed to pick animated file: ' + (error as Error).message);
    }
  };

  const loadBanners = async () => {
    try {
      setBannersLoading(true);
      console.log('Loading banners with token:', token ? 'Present' : 'Missing');

      const response = await fetch(`${API_BASE_URL}/admin/banners`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Banners response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Banners loaded:', data.length);
        setBanners(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load banners:', response.status, errorData);
        Alert.alert('Error', `Failed to load banners: ${response.status} ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading banners:', error);
      Alert.alert('Error', 'Network error loading banners');
    } finally {
      setBannersLoading(false);
    }
  };

  const handleBannerImageUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload banner images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9], // Banner aspect ratio
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the image. Please try again.');
          return;
        }

        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        if (!['png', 'jpg', 'jpeg'].includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG, JPG, or JPEG files only.');
          return;
        }

        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        if (fileSizeInBytes > 5 * 1024 * 1024) {
          Alert.alert('File too large', 'Please select an image smaller than 5MB.');
          return;
        }

        setUploadedBannerImage({
          uri: asset.uri,
          base64: asset.base64,
          type: `image/${fileExtension}`,
          name: `banner_${Date.now()}.${fileExtension}`,
          extension: fileExtension || 'jpg'
        });

        console.log('Banner image selected:', {
          name: `banner_${Date.now()}.${fileExtension}`,
          size: fileSizeInBytes,
          type: `image/${fileExtension}`
        });
      }
    } catch (error) {
      console.error('Error picking banner image:', error);
      Alert.alert('Error', 'Failed to pick banner image');
    }
  };

  const handleAddBanner = async () => {
    if (!bannerTitle.trim()) {
      Alert.alert('Error', 'Banner title is required');
      return;
    }

    if (!uploadedBannerImage) {
      Alert.alert('Error', 'Banner image is required');
      return;
    }

    setLoading(true);
    try {
      const requestBody = {
        title: bannerTitle.trim(),
        description: bannerDescription.trim(),
        linkUrl: bannerLinkUrl.trim(),
        displayOrder: parseInt(bannerDisplayOrder) || 0,
        bannerImage: uploadedBannerImage.base64,
        imageType: uploadedBannerImage.type
      };

      const response = await fetch(`${API_BASE_URL}/admin/banners`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        Alert.alert('Success', 'Banner added successfully');
        setBannerTitle('');
        setBannerDescription('');
        setBannerLinkUrl('');
        setBannerDisplayOrder('0');
        setUploadedBannerImage(null);
        loadBanners();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add banner');
      }
    } catch (error) {
      console.error('Error adding banner:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to add banner');
    } finally {
      setLoading(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this banner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/admin/banners/${bannerId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Success', 'Banner deleted successfully');
                loadBanners();
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete banner');
              }
            } catch (error) {
              console.error('Error deleting banner:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to delete banner');
            }
          }
        }
      ]
    );
  };

  // ==================== SUPPORT TICKETS FUNCTIONS ====================

  const loadSupportTickets = async () => {
    try {
      setTicketsLoading(true);
      const statusParam = ticketStatusFilter === 'all' ? '' : `?status=${ticketStatusFilter}`;
      
      const response = await fetch(`${API_BASE_URL}/support/admin/tickets${statusParam}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load tickets:', errorData);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
      Alert.alert('Error', 'Gagal memuat support tickets');
    } finally {
      setTicketsLoading(false);
    }
  };

  const loadTicketStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/admin/tickets/stats`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const stats = await response.json();
        setTicketStats(stats);
      }
    } catch (error) {
      console.error('Error loading ticket stats:', error);
    }
  };

  const loadTicketMessages = async (ticketId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/admin/tickets/${ticketId}/messages`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const messages = await response.json();
        setTicketMessages(messages);
      } else {
        Alert.alert('Error', 'Gagal memuat pesan tiket');
      }
    } catch (error) {
      console.error('Error loading ticket messages:', error);
      Alert.alert('Error', 'Gagal memuat pesan tiket');
    }
  };

  const handleReplyToTicket = async () => {
    if (!ticketReply.trim()) {
      Alert.alert('Error', 'Pesan reply tidak boleh kosong');
      return;
    }

    if (!selectedTicket) return;

    try {
      const response = await fetch(`${API_BASE_URL}/support/admin/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({ message: ticketReply.trim() }),
      });

      if (response.ok) {
        setTicketReply('');
        loadTicketMessages(selectedTicket.id);
        loadSupportTickets();
        Alert.alert('Berhasil', 'Balasan berhasil dikirim');
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Gagal mengirim balasan');
      }
    } catch (error) {
      console.error('Error replying to ticket:', error);
      Alert.alert('Error', 'Gagal mengirim balasan');
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/admin/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        Alert.alert('Berhasil', 'Status tiket berhasil diperbarui');
        loadSupportTickets();
        loadTicketStats();
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket({ ...selectedTicket, status });
        }
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Gagal memperbarui status');
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
      Alert.alert('Error', 'Gagal memperbarui status');
    }
  };

  const openTicketDetail = async (ticket: any) => {
    setSelectedTicket(ticket);
    setShowTicketDetailModal(true);
    await loadTicketMessages(ticket.id);
  };

  const handleGiftImageUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload gift image files.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // Only images (PNG/JPG)
        allowsEditing: false,
        quality: 1.0, // Use max quality to preserve PNG transparency
        base64: true,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['png', 'jpg', 'jpeg'];

        if (!allowedExtensions.includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG or JPG files only for static gift images. Use the animated upload button for GIF/MP4 files.');
          return;
        }

        // For static images (PNG/JPG)
        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the image file. Please try again.');
          return;
        }

        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        const maxSize = 5 * 1024 * 1024; // 5MB for images

        if (fileSizeInBytes > maxSize) {
          Alert.alert('File too large', 'Please select an image smaller than 5MB.');
          return;
        }

        const contentType = `image/${fileExtension}`;

        setUploadedGiftImage({
          uri: asset.uri,
          base64: asset.base64,
          type: contentType,
          name: `gift_${Date.now()}.${fileExtension}`,
          extension: fileExtension || 'png',
          isAnimated: false,
          duration: null,
          width: asset.width || 0,
          height: asset.height || 0
        });

        console.log('Static gift image selected:', {
          name: `gift_${Date.now()}.${fileExtension}`,
          size: fileSizeInBytes,
          type: contentType,
          isAnimated: false
        });

        Alert.alert('Success', 'Static gift image selected successfully.');
      }
    } catch (error) {
      console.error('Error picking gift file:', error);
      Alert.alert('Error', 'Failed to pick gift file: ' + (error as Error).message);
    }
  };

  const handleAddGift = async () => {
    if (!itemPrice.trim()) {
      Alert.alert('Error', 'Harga gift harus diisi');
      return;
    }

    // Check if either static image or animated file is uploaded
    const hasStaticImage = uploadedGiftImage && uploadedGiftImage.base64;
    const hasAnimatedFile = selectedFile && selectedFile.base64;

    if (!hasStaticImage && !hasAnimatedFile) {
      Alert.alert('Error', 'File gift harus dipilih (gambar PNG/JPG atau file animasi GIF/MP4)');
      return;
    }

    setLoading(true);
    try {
      // Use animated file if uploaded, otherwise use static image
      const fileToUpload = hasAnimatedFile ? selectedFile : uploadedGiftImage;
      const isVideo = fileToUpload.type?.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(fileToUpload.extension || '');
      const isAnimated = hasAnimatedFile || fileToUpload.isAnimated;

      const requestBody: any = {
        name: itemName.trim() || 'Untitled Gift',
        icon: '🎁',
        price: parseInt(itemPrice),
        type: isAnimated ? 'animated' : 'static',
        category: 'popular'
      };

      if (!fileToUpload.base64) {
        Alert.alert('Error', 'File belum siap. Silakan coba lagi.');
        setLoading(false);
        return;
      }

      requestBody.giftImage = fileToUpload.base64;
      requestBody.imageType = fileToUpload.type;
      requestBody.imageName = fileToUpload.name;

      if (isAnimated) {
        requestBody.hasAnimation = true;
        requestBody.isAnimated = true;
        if (fileToUpload.duration) {
          requestBody.duration = fileToUpload.duration;
        }
      }

      console.log('Sending gift data:', {
        name: requestBody.name,
        type: requestBody.type,
        hasBase64: !!requestBody.giftImage,
        fileType: requestBody.imageType,
        isVideo: isVideo,
        isAnimated: requestBody.isAnimated,
        source: hasAnimatedFile ? 'animated-slot' : 'static-slot'
      });

      const response = await fetch(`${API_BASE_URL}/admin/gifts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        Alert.alert('Berhasil', 'Gift berhasil ditambahkan');
        setItemName('');
        setItemPrice('');
        setSelectedFile(null);
        setUploadedGiftImage(null);
        loadGifts();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Gagal menambahkan gift');
      }
    } catch (error) {
      console.error('Error adding gift:', error);
      Alert.alert('Error', (error as Error).message || 'Gagal menambahkan gift');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!itemName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    setLoading(true);
    try {
      {
        if (!itemIcon.trim()) {
          Alert.alert('Error', 'Please enter gift icon');
          return;
        }
        if (!itemPrice.trim()) {
          Alert.alert('Error', 'Please enter price');
          return;
        }

        const requestBody: any = {
          name: itemName.trim(),
          icon: itemIcon.trim(),
          price: parseInt(itemPrice),
          type: selectedFile ? 'animated' : 'static',
          category: itemCategory?.trim() || 'popular'
        };

        if (uploadedGiftImage) {
          requestBody.giftImage = uploadedGiftImage.base64;
          requestBody.imageType = uploadedGiftImage.type;
          requestBody.imageName = uploadedGiftImage.name;
        }

        if (selectedFile) {
          requestBody.hasAnimation = true;
        }

        console.log('Sending gift request:', {
          name: requestBody.name,
          category: requestBody.category,
          hasImage: !!requestBody.giftImage,
          hasAnimation: requestBody.hasAnimation
        });

        const response = await fetch(`${API_BASE_URL}/admin/gifts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'ChatMe-Mobile-App',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          Alert.alert('Success', 'Gift added successfully');
          loadGifts();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add gift');
        }
      }

      setItemName('');
      setItemIcon('');
      setItemCategory('');
      setItemPrice('');
      setSelectedFile(null);
      setUploadedGiftImage(null);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding item:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    if (!searchUsername.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/search?username=${encodeURIComponent(searchUsername.trim())}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to search users: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Network error searching users');
    } finally {
      setSearchLoading(false);
    }
  };

  const promoteUser = async (userId: string, username: string, newRole: 'admin' | 'mentor') => {
    Alert.alert(
      'Confirm Promotion',
      `Are you sure you want to make ${username} ${newRole === 'admin' ? 'an admin' : 'a mentor'}?${newRole === 'mentor' ? ' (Role will expire after 1 month)' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              setLoading(true);
              const response = await fetch(`${API_BASE_URL}/admin/users/promote`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
                body: JSON.stringify({
                  userId,
                  newRole
                }),
              });

              if (response.ok) {
                const data = await response.json();
                Alert.alert('Success', data.message);
                searchUsers();
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to promote user');
              }
            } catch (error) {
              console.error('Error promoting user:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to promote user');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCreateSpecialAccount = async () => {
    if (!createAccountId.trim() || !createAccountUsername.trim() || !createAccountEmail.trim() || !createAccountPassword.trim()) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    const accountId = parseInt(createAccountId);
    if (isNaN(accountId) || accountId < 1 || accountId > 999) {
      Alert.alert('Error', 'ID must be a number between 1-999');
      return;
    }

    const username = createAccountUsername.trim();
    if (username.length < 3 || username.length > 20) {
      Alert.alert('Error', 'Username must be 3-20 characters');
      return;
    }

    const email = createAccountEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Invalid email format');
      return;
    }

    if (createAccountPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setCreateAccountLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/create-special-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          id: accountId,
          username: createAccountUsername.trim(),
          email: createAccountEmail.trim(),
          password: createAccountPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', `Special account created successfully!\nID: ${accountId}\nUsername: ${createAccountUsername}`);
        setCreateAccountId('');
        setCreateAccountUsername('');
        setCreateAccountEmail('');
        setCreateAccountPassword('');
        loadUserStats();
      } else {
        Alert.alert('Error', data.error || 'Failed to create special account');
      }
    } catch (error) {
      console.error('Error creating special account:', error);
      Alert.alert('Error', 'Network error creating special account');
    } finally {
      setCreateAccountLoading(false);
    }
  };

  const handleChangeUserEmail = async () => {
    if (!changeEmailUsername.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    if (!changeEmailNewEmail.trim()) {
      Alert.alert('Error', 'Email baru harus diisi');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(changeEmailNewEmail)) {
      Alert.alert('Error', 'Format email tidak valid');
      return;
    }

    setChangeEmailLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/change-user-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: changeEmailUsername.trim(),
          newEmail: changeEmailNewEmail.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', `Email untuk user "${changeEmailUsername}" berhasil diganti!`);
        setChangeEmailUsername('');
        setChangeEmailNewEmail('');
      } else {
        Alert.alert('Error', data.error || 'Gagal mengganti email');
      }
    } catch (error) {
      console.error('Error changing user email:', error);
      Alert.alert('Error', 'Network error. Silakan coba lagi.');
    } finally {
      setChangeEmailLoading(false);
    }
  };

  const handleResetUserPassword = async () => {
    if (!resetPasswordUsername.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    if (!resetPasswordNewPassword.trim()) {
      Alert.alert('Error', 'Password baru harus diisi');
      return;
    }

    if (resetPasswordNewPassword.length < 6) {
      Alert.alert('Error', 'Password minimal 6 karakter');
      return;
    }

    setResetPasswordLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/reset-user-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: resetPasswordUsername.trim(),
          newPassword: resetPasswordNewPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', `Password untuk user "${resetPasswordUsername}" berhasil direset!`);
        setResetPasswordUsername('');
        setResetPasswordNewPassword('');
      } else {
        Alert.alert('Error', data.error || 'Gagal reset password');
      }
    } catch (error) {
      console.error('Error resetting user password:', error);
      Alert.alert('Error', 'Network error. Silakan coba lagi.');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const handleAdminAddCredit = async () => {
    if (!adminCreditUsername.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    if (!adminCreditAmount.trim() || isNaN(Number(adminCreditAmount)) || Number(adminCreditAmount) <= 0) {
      Alert.alert('Error', 'Jumlah kredit harus berupa angka positif');
      return;
    }

    setAdminCreditLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/credits/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: adminCreditUsername.trim(),
          amount: Number(adminCreditAmount),
          reason: adminCreditReason.trim() || 'Admin credit addition'
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Send notification to recipient
        try {
          await fetch(`${API_BASE_URL}/notifications/send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipientUsername: adminCreditUsername.trim(),
              type: 'credit_received',
              title: 'Credit Added by Admin',
              message: `Administrator added ${Number(adminCreditAmount).toLocaleString()} credits to your account. Reason: ${adminCreditReason}`,
              data: {
                amount: Number(adminCreditAmount),
                from: 'Administrator',
                reason: adminCreditReason
              }
            }),
          });
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }

        Alert.alert('Berhasil', `Credit berhasil ditambahkan ke ${adminCreditUsername}!`);
        setAdminCreditUsername('');
        setAdminCreditAmount('');
        setAdminCreditReason('');
      } else {
        Alert.alert('Error', data.error || 'Gagal menambah credit');
      }
    } catch (error) {
      console.error('Error adding admin credits:', error);
      Alert.alert('Error', 'Gagal menambahkan kredit. Silakan coba lagi.');
    } finally {
      setAdminCreditLoading(false);
    }
  };

  const loadUserStatus = async () => {
    setStatusLoading(true);
    try {
      // Get device info
      const deviceName = `${deviceInfo.brand} ${deviceInfo.modelName}`;

      // Get location info (request permission first)
      let locationString = 'Unknown';
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          const reverseGeocode = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });

          if (reverseGeocode.length > 0) {
            const address = reverseGeocode[0];
            locationString = `${address.city || address.region || address.country || 'Unknown'}`;
          }
        }
      } catch (locationError) {
        console.log('Location permission denied or unavailable');
      }

      const response = await fetch(`${API_BASE_URL}/admin/users/status`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const users = await response.json();
        setUserStatusList(Array.isArray(users) ? users : []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to load user status: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading user status:', error);
      Alert.alert('Error', 'Network error loading user status');
    } finally {
      setStatusLoading(false);
    }
  };

  const loadUserCreditHistory = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/credits/history/${userId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserCreditHistory(data.transactions || []);
      } else {
        Alert.alert('Error', 'Failed to load credit history');
      }
    } catch (error) {
      console.error('Error loading credit history:', error);
      Alert.alert('Error', 'Network error loading credit history');
    }
  };

  const loadBannedDevices = async () => {
    setBanLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/banned-devices`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBannedDevicesList(data.bannedList || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to load banned devices: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading banned devices:', error);
      Alert.alert('Error', 'Network error loading banned devices');
    } finally {
      setBanLoading(false);
    }
  };

  // Room management functions
  const loadRooms = async () => {
    setRoomsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/rooms`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data.rooms || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to load rooms: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
      Alert.alert('Error', 'Network error loading rooms');
    } finally {
      setRoomsLoading(false);
    }
  };

  const deleteRoom = async (roomId: string, roomName: string) => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete room "${roomName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setRoomsLoading(true);
              const response = await fetch(`${API_BASE_URL}/admin/rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Success', `Room "${roomName}" deleted successfully`);
                loadRooms(); // Refresh room list
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete room');
              }
            } catch (error) {
              console.error('Error deleting room:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to delete room');
            } finally {
              setRoomsLoading(false);
            }
          }
        }
      ]
    );
  };

  const openEditRoomModal = (room: Room) => {
    setSelectedRoom(room);
    setEditRoomName(room.name);
    setEditRoomDescription(room.description || '');
    const capacity = room.maxMembers || 25;
    setEditRoomMaxMembers(capacity);
    setEditRoomMaxMembersInput(capacity.toString());
    setEditRoomOwner(room.managedBy || room.createdBy || '');
    setEditRoomCategory((room.category === 'game' ? 'game' : 'social') as 'social' | 'game');
    setShowEditRoomModal(true);
  };

  const saveRoomChanges = async () => {
    if (!selectedRoom) return;

    if (!editRoomName.trim()) {
      Alert.alert('Error', 'Room name is required');
      return;
    }

    if (!editRoomDescription.trim()) {
      Alert.alert('Error', 'Room description is required');
      return;
    }

    if (!editRoomMaxMembers || editRoomMaxMembers <= 0) {
      Alert.alert('Error', 'Maximum capacity must be greater than 0');
      return;
    }

    setEditingRoom(true);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/rooms/${selectedRoom.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          name: editRoomName.trim(),
          description: editRoomDescription.trim(),
          maxMembers: editRoomMaxMembers,
          managedBy: editRoomOwner.trim(),
          category: editRoomCategory
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'Room updated successfully');
        setShowEditRoomModal(false);
        loadRooms(); // Refresh room list
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update room');
      }
    } catch (error) {
      console.error('Error updating room:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to update room');
    } finally {
      setEditingRoom(false);
    }
  };

  // Withdrawal Management Functions
  const loadWithdrawals = async () => {
    try {
      setWithdrawalsLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/withdrawals`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWithdrawals(data.withdrawals || []);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        Alert.alert('Error', `Failed to load withdrawals: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
      Alert.alert('Error', 'Network error loading withdrawals');
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const approveWithdrawal = async (withdrawal: Withdrawal) => {
    Alert.alert(
      'Approve Withdrawal',
      `Approve withdrawal for ${withdrawal.username}?\n\nAmount: $${withdrawal.amountUsd.toFixed(2)} USD (${withdrawal.amountCoins.toLocaleString()} coins)\nNet: Rp ${withdrawal.netAmountIdr.toLocaleString()}\nAccount: ${withdrawal.accountDetails.accountName} (${withdrawal.accountDetails.accountNumber})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setProcessingWithdrawal(true);
              const response = await fetch(`${API_BASE_URL}/admin/withdrawals/${withdrawal.id}/approve`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
                body: JSON.stringify({ notes: `Approved by ${user?.username}` })
              });

              if (response.ok) {
                Alert.alert('Success', 'Withdrawal approved successfully');
                loadWithdrawals();
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to approve withdrawal');
              }
            } catch (error) {
              console.error('Error approving withdrawal:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to approve withdrawal');
            } finally {
              setProcessingWithdrawal(false);
            }
          }
        }
      ]
    );
  };

  const openRejectModal = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setRejectReason('');
    setShowWithdrawalModal(true);
  };

  const rejectWithdrawal = async () => {
    if (!selectedWithdrawal) return;

    if (!rejectReason.trim()) {
      Alert.alert('Error', 'Please provide a rejection reason');
      return;
    }

    try {
      setProcessingWithdrawal(true);
      const response = await fetch(`${API_BASE_URL}/admin/withdrawals/${selectedWithdrawal.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({ reason: rejectReason.trim() })
      });

      if (response.ok) {
        Alert.alert('Success', 'Withdrawal rejected and refunded successfully');
        setShowWithdrawalModal(false);
        setSelectedWithdrawal(null);
        setRejectReason('');
        loadWithdrawals();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject withdrawal');
      }
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      Alert.alert('Error', (error as Error).message || 'Failed to reject withdrawal');
    } finally {
      setProcessingWithdrawal(false);
    }
  };

  const handleBanDevice = async (userId: string, username: string, deviceId: string, userIp: string) => {
    Alert.alert(
      'Ban Device',
      `Are you sure you want to ban the device used by ${username}?\n\nDevice: ${deviceId || 'Unknown Device'}\nIP: ${userIp || 'Unknown IP'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban Device',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Ban Reason',
              'Enter reason for banning this device:',
              (reason) => {
                if (reason && reason.trim()) {
                  executeBan('device', userId, username, deviceId || `${username}_device`, reason.trim());
                }
              },
              'plain-text',
              'Suspicious activity'
            );
          }
        }
      ]
    );
  };

  const handleBanIP = async (userId: string, username: string, userIp: string) => {
    Alert.alert(
      'Ban IP Address',
      `Are you sure you want to ban the IP address used by ${username}?\n\nIP: ${userIp || 'Unknown IP'}\n\nThis will affect all users from this IP.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban IP',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Ban Reason',
              'Enter reason for banning this IP address:',
              (reason) => {
                if (reason && reason.trim()) {
                  executeBan('ip', userId, username, userIp || 'unknown_ip', reason.trim());
                }
              },
              'plain-text',
              'Suspicious activity'
            );
          }
        }
      ]
    );
  };

  const executeBan = async (banType: string, userId: string, username: string, target: string, reason: string) => {
    setBanLoading(true);
    try {
      console.log('Executing ban:', { banType, userId, username, target, reason });

      const response = await fetch(`${API_BASE_URL}/admin/ban-${banType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          userId: userId.toString(),
          username: username,
          target: target,
          reason: reason,
          banType: banType
        }),
      });

      console.log('Ban response status:', response.status);

      if (response.ok) {
        const responseData = await response.json();
        Alert.alert('Success', `${banType.toUpperCase()} banned successfully`);
        loadBannedDevices();
        loadUserStatus();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        console.error('Ban error response:', errorData);
        throw new Error(errorData.error || `Failed to ban ${banType}`);
      }
    } catch (error) {
      console.error(`Error banning ${banType}:`, error);
      Alert.alert('Error', (error as Error).message || `Failed to ban ${banType}. Please check your connection.`);
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnban = async (banId: string, banType: string, target: string) => {
    Alert.alert(
      'Confirm Unban',
      `Are you sure you want to unban this ${banType}?\n\nTarget: ${target}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unban',
          onPress: async () => {
            setBanLoading(true);
            try {
              const response = await fetch(`${API_BASE_URL}/admin/unban`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
                body: JSON.stringify({
                  banId,
                  banType
                }),
              });

              if (response.ok) {
                Alert.alert('Success', `${banType.toUpperCase()} unbanned successfully`);
                loadBannedDevices();
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to unban');
              }
            } catch (error) {
              console.error('Error unbanning:', error);
              Alert.alert('Error', (error as Error).message || 'Failed to unban');
            } finally {
              setBanLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteItem = async (id: string, type: 'gift') => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete this ${type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/admin/gifts/${id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Success', 'Gift deleted successfully');
                loadGifts();
              } else {
                throw new Error('Failed to delete gift');
              }
            } catch (error) {
              console.error('Error deleting gift:', error);
              Alert.alert('Error', 'Failed to delete gift');
            }
          }
        }
      ]
    );
  };

  const handleEditGift = (gift: Gift) => {
    setEditingGift(gift);
    setEditGiftName(gift.name);
    setEditGiftPrice(gift.price.toString());
    setShowEditModal(true);
  };

  const handleUpdateGift = async () => {
    if (!editingGift || !editGiftName.trim() || !editGiftPrice.trim()) {
      Alert.alert('Error', 'Nama dan harga gift harus diisi');
      return;
    }

    const price = parseInt(editGiftPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Error', 'Harga harus berupa angka positif');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/gifts/${editingGift.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editGiftName.trim(),
          icon: editingGift.icon,
          price: price,
          type: editingGift.type,
          category: editingGift.category,
          image: editingGift.image,
          animation: editingGift.animation
        }),
      });

      if (response.ok) {
        Alert.alert('Berhasil', 'Gift berhasil diupdate!');
        setShowEditModal(false);
        setEditingGift(null);
        setEditGiftName('');
        setEditGiftPrice('');
        loadGifts();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Gagal mengupdate gift');
      }
    } catch (error) {
      console.error('Error updating gift:', error);
      Alert.alert('Error', (error as Error).message || 'Gagal mengupdate gift');
    } finally {
      setLoading(false);
    }
  };

  const renderGiftItem = ({ item }: { item: Gift }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.giftDisplayContainer}>
          {item.image ? (
            <Image source={{ uri: `${API_BASE_URL}${item.image}` }} style={styles.giftItemImage} />
          ) : (
            <Text style={styles.itemEmoji}>{item.icon}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteItem(item.id, 'gift')}
        >
          <Ionicons name="trash-outline" size={16} color="#F44336" />
        </TouchableOpacity>
      </View>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemPrice}>{item.price} credits</Text>
      <Text style={styles.itemType}>{item.type}</Text>
      {item.category && item.category !== 'lucky' && (
        <Text style={styles.itemCategory}>{item.category}</Text>
      )}
    </View>
  );

  const renderGiftGridItem = ({ item }: { item: Gift }) => (
    <TouchableOpacity 
      style={styles.giftGridCard}
      onLongPress={() => handleEditGift(item)}
      activeOpacity={0.8}
    >
      <View style={styles.giftGridImageContainer}>
        {item.image ? (
          <Image 
            source={{ uri: `${API_BASE_URL}${item.image}` }} 
            style={styles.giftGridImage} 
            resizeMode="cover"
          />
        ) : (
          <View style={styles.giftGridEmojiContainer}>
            <Text style={styles.giftGridEmoji}>{item.icon}</Text>
          </View>
        )}
        {/* Video indicator badge */}
        {(item.mediaType === 'video' || (item.animation && (item.animation.toLowerCase().includes('.mp4') || item.animation.toLowerCase().includes('.webm') || item.animation.toLowerCase().includes('.mov')))) && (
          <View style={styles.videoIndicatorBadge}>
            <Ionicons name="videocam" size={14} color="#fff" />
          </View>
        )}
        <View style={styles.giftGridOverlay}>
          <Text style={styles.giftGridPrice}>{item.price}💎</Text>
        </View>
      </View>
      <View style={styles.giftGridInfo}>
        <Text style={styles.giftGridName} numberOfLines={1}>{item.name}</Text>
        {item.category && item.category !== 'lucky' && (
          <Text style={styles.giftGridCategory} numberOfLines={1}>{item.category}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <Text style={styles.userName}>{item.username}</Text>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
            <Text style={styles.roleText}>{item.role}</Text>
          </View>
        </View>
        {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
      </View>
      <View style={styles.userActions}>
        {item.role !== 'admin' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.adminBtn]}
            onPress={() => promoteUser(item.id, item.username, 'admin')}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>Make Admin</Text>
          </TouchableOpacity>
        )}
        {item.role !== 'mentor' && item.role !== 'admin' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.mentorBtn]}
            onPress={() => promoteUser(item.id, item.username, 'mentor')}
            disabled={loading}
          >
            <Text style={styles.actionBtnText}>Make Mentor</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#F44336';
      case 'mentor': return '#FF9800';
      case 'merchant': return '#9C27B0';
      default: return '#4CAF50';
    }
  };

  const getActiveMenuTitle = () => {
    const activeMenuItem = menuItems.find(item => item.id === activeTab);
    return activeMenuItem?.title || 'Admin Panel';
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return (
          <ScrollView style={styles.statsContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.statsCards}>
              <View style={[styles.statCard, { backgroundColor: '#4ECDC4' }]}>
                <Ionicons name="people" size={40} color="#fff" />
                <Text style={styles.statNumber}>{userStats?.totalUsers || 0}</Text>
                <Text style={styles.statLabel}>Total Users</Text>
              </View>
              
              <View style={[styles.statCard, { backgroundColor: '#45B7D1' }]}>
                <Ionicons name="radio-button-on" size={40} color="#fff" />
                <Text style={styles.statNumber}>{userStats?.onlineUsers || 0}</Text>
                <Text style={styles.statLabel}>Online Now</Text>
              </View>
            </View>

            {userStats?.registrationStats && userStats.registrationStats.length > 0 && (
              <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Registrations (Last 30 Days)</Text>
                <View style={styles.chartBars}>
                  {userStats.registrationStats.slice(0, 10).reverse().map((stat: any, index: number) => {
                    const maxCount = Math.max(...userStats.registrationStats.map((s: any) => parseInt(s.count)));
                    const barHeight = (parseInt(stat.count) / maxCount) * 150;
                    return (
                      <View key={index} style={styles.barContainer}>
                        <View style={[styles.bar, { height: barHeight, backgroundColor: '#4ECDC4' }]} />
                        <Text style={styles.barLabel}>{stat.count}</Text>
                        <Text style={styles.dateLabel}>{stat.date ? new Date(stat.date).getDate() : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.createAccountContainer}>
              <Text style={styles.sectionTitle}>Create Special Account</Text>
              <Text style={styles.sectionSubtitle}>Create verified accounts with custom 1-3 digit IDs</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Account ID (1-3 digits)</Text>
                <TextInput
                  style={styles.formInput}
                  value={createAccountId}
                  onChangeText={setCreateAccountId}
                  placeholder="Enter ID (1-999)"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Username</Text>
                <TextInput
                  style={styles.formInput}
                  value={createAccountUsername}
                  onChangeText={setCreateAccountUsername}
                  placeholder="Enter username"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email</Text>
                <TextInput
                  style={styles.formInput}
                  value={createAccountEmail}
                  onChangeText={setCreateAccountEmail}
                  placeholder="Enter email"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Password</Text>
                <TextInput
                  style={styles.formInput}
                  value={createAccountPassword}
                  onChangeText={setCreateAccountPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#999"
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.createAccountButton, createAccountLoading && styles.createAccountButtonDisabled]}
                onPress={handleCreateSpecialAccount}
                disabled={createAccountLoading}
              >
                {createAccountLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={20} color="#fff" />
                    <Text style={styles.createAccountButtonText}>Create Account</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        );

      case 'gift':
        return (
          <ScrollView style={styles.giftFormContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.giftFormCard}>
              <Text style={styles.formTitle}>Add New Gift</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nama Gift</Text>
                <TextInput
                  style={styles.formInput}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="Masukkan nama gift..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Harga Gift</Text>
                <TextInput
                  style={styles.formInput}
                  value={itemPrice}
                  onChangeText={setItemPrice}
                  placeholder="Masukkan harga dalam credits..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Upload Gambar Gift (PNG)</Text>
                <TouchableOpacity
                  style={styles.uploadFormButton}
                  onPress={handleGiftImageUpload}
                >
                  <Ionicons name="image-outline" size={24} color="#FF6B35" />
                  <Text style={styles.uploadFormText}>
                    {uploadedGiftImage ? uploadedGiftImage.name : 'Pilih Gambar PNG'}
                  </Text>
                </TouchableOpacity>
                {uploadedGiftImage && (
                  <View style={styles.formPreviewContainer}>
                    {uploadedGiftImage.type?.startsWith('video/') ? (
                      <View style={styles.videoPreviewContainer}>
                        <Ionicons name="videocam" size={40} color="#FF6B35" />
                        <Text style={styles.videoPreviewText}>
                          Video: {uploadedGiftImage.name}
                        </Text>
                        {uploadedGiftImage.duration && (
                          <Text style={styles.videoDurationText}>
                            Duration: {Math.round(uploadedGiftImage.duration / 1000)}s
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Image source={{ uri: uploadedGiftImage.uri }} style={styles.formPreviewImage} />
                    )}
                    <TouchableOpacity
                      style={styles.formRemoveButton}
                      onPress={() => setUploadedGiftImage(null)}
                    >
                      <Ionicons name="close-circle" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Upload Gift Animasi (MP4/GIF/Lottie JSON)</Text>
                <TouchableOpacity
                  style={styles.uploadFormButton}
                  onPress={handleFileUpload}
                >
                  <Ionicons name="play-circle-outline" size={24} color="#FF6B35" />
                  <Text style={styles.uploadFormText}>
                    {selectedFile ? selectedFile.name : 'Pilih File Animasi'}
                  </Text>
                </TouchableOpacity>
                {selectedFile && (
                  <View style={styles.formFileInfo}>
                    <Text style={styles.formFileName}>{selectedFile.name}</Text>
                    <TouchableOpacity
                      style={styles.formRemoveButton}
                      onPress={() => setSelectedFile(null)}
                    >
                      <Ionicons name="close-circle" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddGift}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Gift</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.giftListContainer}>
              <Text style={styles.giftListTitle}>Gift yang Sudah Ditambahkan ({gifts.length})</Text>
              <Text style={styles.giftHelpText}>Tekan lama gift untuk mengedit</Text>
              {gifts.length > 0 ? (
                <View style={styles.giftGridContainer}>
                  {gifts.map((item) => (
                    <View key={item.id}>
                      {renderGiftGridItem({ item })}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyGiftList}>
                  <Ionicons name="gift-outline" size={40} color="#ccc" />
                  <Text style={styles.emptyGiftText}>Belum ada gift yang ditambahkan</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );

      case 'frames':
        return (
          <ScrollView style={styles.giftFormContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.giftFormCard}>
              <Text style={styles.formTitle}>Add New Avatar Frame</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Frame Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={frameName}
                  onChangeText={setFrameName}
                  placeholder="Enter frame name..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={frameDescription}
                  onChangeText={setFrameDescription}
                  placeholder="Enter description..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Price (Credits)</Text>
                <TextInput
                  style={styles.formInput}
                  value={framePrice}
                  onChangeText={setFramePrice}
                  placeholder="Enter price in credits..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Rental Duration (Days)</Text>
                <TextInput
                  style={styles.formInput}
                  value={frameDurationDays}
                  onChangeText={setFrameDurationDays}
                  placeholder="Enter duration (e.g., 7, 14, 30)..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Upload Frame Image (PNG/GIF)</Text>
                <TouchableOpacity
                  style={styles.uploadFormButton}
                  onPress={handleFrameImageUpload}
                >
                  <Ionicons name="image-outline" size={24} color="#FF6B35" />
                  <Text style={styles.uploadFormText}>
                    {uploadedFrameImage ? uploadedFrameImage.name : 'Select PNG/GIF Image'}
                  </Text>
                </TouchableOpacity>
                {uploadedFrameImage && (
                  <View style={styles.formPreviewContainer}>
                    <Image source={{ uri: uploadedFrameImage.uri }} style={styles.formPreviewImage} />
                    <TouchableOpacity
                      style={styles.formRemoveButton}
                      onPress={() => setUploadedFrameImage(null)}
                    >
                      <Ionicons name="close-circle" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={editingFrame ? handleUpdateFrame : handleAddFrame}
                disabled={framesLoading}
              >
                {framesLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingFrame ? 'Update Frame' : 'Add Frame'}
                  </Text>
                )}
              </TouchableOpacity>
              {editingFrame && (
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#666', marginTop: 10 }]}
                  onPress={() => {
                    setEditingFrame(null);
                    setFrameName('');
                    setFrameDescription('');
                    setFramePrice('');
                    setFrameDurationDays('14');
                    setUploadedFrameImage(null);
                  }}
                >
                  <Text style={styles.submitButtonText}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.giftListContainer}>
              <Text style={styles.giftListTitle}>Avatar Frames ({frames.length})</Text>
              <Text style={styles.giftHelpText}>Long press frame to edit/delete</Text>
              {framesLoading ? (
                <View style={styles.emptyGiftList}>
                  <ActivityIndicator size="large" color="#FF6B35" />
                  <Text style={styles.emptyGiftText}>Loading frames...</Text>
                </View>
              ) : frames.length > 0 ? (
                <View style={styles.giftGridContainer}>
                  {frames.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.giftCard}
                      onLongPress={() => {
                        Alert.alert(
                          'Frame Actions',
                          `Manage: ${item.name}`,
                          [
                            { text: 'Edit', onPress: () => handleEditFrame(item) },
                            { text: 'Delete', onPress: () => handleDeleteFrame(Number(item.id)), style: 'destructive' },
                            { text: 'Cancel', style: 'cancel' }
                          ]
                        );
                      }}
                    >
                      <Image
                        source={{ uri: item.image }}
                        style={{ width: 80, height: 80, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                      <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.giftPrice}>{item.price} credits</Text>
                      <Text style={styles.giftPrice}>{item.durationDays} days</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyGiftList}>
                  <Ionicons name="images-outline" size={40} color="#ccc" />
                  <Text style={styles.emptyGiftText}>No frames added yet</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );

      case 'manage-users':
        return (
          <View style={styles.userSearchContainer}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                value={searchUsername}
                onChangeText={setSearchUsername}
                placeholder="Search username..."
                placeholderTextColor="#999"
                onSubmitEditing={searchUsers}
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={searchUsers}
                disabled={searchLoading}
              >
                {searchLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            <FlatList
              data={searchResults}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                searchUsername.trim() ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="person-outline" size={60} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Users Found</Text>
                    <Text style={styles.emptySubtitle}>Try searching with a different username</Text>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={60} color="#ccc" />
                    <Text style={styles.emptyTitle}>Search Users</Text>
                    <Text style={styles.emptySubtitle}>Enter a username to search and manage user roles</Text>
                  </View>
                )
              }
            />
          </View>
        );

      case 'admin-credit':
        return (
          <ScrollView style={styles.creditTransferContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.creditTransferCard}>
              <Text style={styles.creditTransferTitle}>Add Credits (Admin)</Text>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Username Penerima</Text>
                <TextInput
                  style={styles.creditInput}
                  value={adminCreditUsername}
                  onChangeText={setAdminCreditUsername}
                  placeholder="Masukkan username penerima..."
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Jumlah Credit</Text>
                <TextInput
                  style={styles.creditInput}
                  value={adminCreditAmount}
                  onChangeText={setAdminCreditAmount}
                  placeholder="Masukkan jumlah credit..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Alasan (Opsional)</Text>
                <TextInput
                  style={styles.creditInput}
                  value={adminCreditReason}
                  onChangeText={setAdminCreditReason}
                  placeholder="Alasan penambahan credit..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.transferButtonContainer}>
                <TouchableOpacity
                  style={[styles.transferButton, { backgroundColor: '#4CAF50' }]}
                  onPress={handleAdminAddCredit}
                  disabled={adminCreditLoading}
                >
                  {adminCreditLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={20} color="#fff" />
                      <Text style={styles.transferButtonText}>Add Credit</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );

      case 'change-email':
        return (
          <ScrollView style={styles.creditTransferContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.creditTransferCard}>
              <Text style={styles.creditTransferTitle}>Ganti Email User</Text>
              <Text style={styles.creditTransferSubtitle}>
                Fitur ini untuk membantu user yang lupa/kehilangan akses email lama
              </Text>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Username User</Text>
                <TextInput
                  style={styles.creditInput}
                  value={changeEmailUsername}
                  onChangeText={setChangeEmailUsername}
                  placeholder="Masukkan username user..."
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Email Baru</Text>
                <TextInput
                  style={styles.creditInput}
                  value={changeEmailNewEmail}
                  onChangeText={setChangeEmailNewEmail}
                  placeholder="user@gmail.com atau user@yahoo.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.transferButtonContainer}>
                <TouchableOpacity
                  style={[styles.transferButton, { backgroundColor: '#00BCD4' }]}
                  onPress={handleChangeUserEmail}
                  disabled={changeEmailLoading}
                >
                  {changeEmailLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="mail-open" size={20} color="#fff" />
                      <Text style={styles.transferButtonText}>Ganti Email</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );

      case 'reset-password':
        return (
          <ScrollView style={styles.creditTransferContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.creditTransferCard}>
              <Text style={styles.creditTransferTitle}>Reset Password User</Text>
              <Text style={styles.creditTransferSubtitle}>
                Fitur ini untuk membantu user yang lupa password
              </Text>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Username User</Text>
                <TextInput
                  style={styles.creditInput}
                  value={resetPasswordUsername}
                  onChangeText={setResetPasswordUsername}
                  placeholder="Masukkan username user..."
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Password Baru</Text>
                <TextInput
                  style={styles.creditInput}
                  value={resetPasswordNewPassword}
                  onChangeText={setResetPasswordNewPassword}
                  placeholder="Minimal 6 karakter..."
                  placeholderTextColor="#999"
                  secureTextEntry
                />
              </View>

              <View style={styles.transferButtonContainer}>
                <TouchableOpacity
                  style={[styles.transferButton, { backgroundColor: '#FF5722' }]}
                  onPress={handleResetUserPassword}
                  disabled={resetPasswordLoading}
                >
                  {resetPasswordLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="key" size={20} color="#fff" />
                      <Text style={styles.transferButtonText}>Reset Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );

      case 'banners':
        return (
          <ScrollView style={styles.bannerContainer} showsVerticalScrollIndicator={false}>
            <View style={[styles.bannerFormCard, { marginHorizontal: 16, marginTop: 16 }]}>
              <Text style={styles.formTitle}>Add New Banner</Text>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Banner Title *</Text>
                <TextInput
                  style={styles.formInput}
                  value={bannerTitle}
                  onChangeText={setBannerTitle}
                  placeholder="Enter banner title..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={styles.formInput}
                  value={bannerDescription}
                  onChangeText={setBannerDescription}
                  placeholder="Enter description..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Link URL (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={bannerLinkUrl}
                  onChangeText={setBannerLinkUrl}
                  placeholder="https://example.com"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.formInput}
                  value={bannerDisplayOrder}
                  onChangeText={setBannerDisplayOrder}
                  placeholder="0"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Banner Image (16:9 aspect ratio) *</Text>
                <TouchableOpacity
                  style={styles.uploadFormButton}
                  onPress={handleBannerImageUpload}
                >
                  <Ionicons name="image-outline" size={24} color="#E91E63" />
                  <Text style={styles.uploadFormText}>
                    {uploadedBannerImage ? uploadedBannerImage.name : 'Select Banner Image'}
                  </Text>
                </TouchableOpacity>
                {uploadedBannerImage && (
                  <View style={styles.formPreviewContainer}>
                    <Image source={{ uri: uploadedBannerImage.uri }} style={styles.bannerPreviewImage} />
                    <TouchableOpacity
                      style={styles.formRemoveButton}
                      onPress={() => setUploadedBannerImage(null)}
                    >
                      <Ionicons name="close-circle" size={20} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddBanner}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Add Banner</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.bannerListContainer, { marginHorizontal: 16, marginBottom: 16 }]}>
              <Text style={styles.bannerListTitle}>Existing Banners</Text>
              {bannersLoading ? (
                <ActivityIndicator size="large" color="#E91E63" />
              ) : banners.length > 0 ? (
                <FlatList
                  data={banners}
                  renderItem={({ item }) => (
                    <View style={styles.bannerCard}>
                      <Image 
                        source={{ uri: `${API_BASE_URL}${item.imageUrl}` }} 
                        style={styles.bannerCardImage}
                        resizeMode="cover"
                      />
                      <View style={styles.bannerCardContent}>
                        <Text style={styles.bannerCardTitle}>{item.title}</Text>
                        <Text style={styles.bannerCardDescription}>{item.description}</Text>
                        <View style={styles.bannerCardMeta}>
                          <Text style={styles.bannerCardOrder}>Order: {item.displayOrder}</Text>
                          <Text style={styles.bannerCardClicks}>Clicks: {item.clickCount}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBannerButton}
                          onPress={() => deleteBanner(item.id)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#F44336" />
                          <Text style={styles.deleteBannerText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
              ) : (
                <View style={styles.emptyBannerList}>
                  <Ionicons name="image-outline" size={40} color="#ccc" />
                  <Text style={styles.emptyBannerText}>No banners added yet</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );

      case 'rooms':
        return (
          <ScrollView style={styles.roomManageContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.roomManageHeader}>
              <Text style={styles.roomManageTitle}>Room Management</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={loadRooms}
                disabled={roomsLoading}
              >
                {roomsLoading ? (
                  <ActivityIndicator size="small" color="#673AB7" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#673AB7" />
                )}
              </TouchableOpacity>
            </View>

            {/* Search Room */}
            <View style={styles.searchRoomContainer}>
              <View style={styles.searchInput}>
                <Ionicons name="search" size={20} color="#666" />
                <TextInput
                  style={styles.searchTextInput}
                  placeholder="Search room name..."
                  value={searchRoomText}
                  onChangeText={setSearchRoomText}
                  placeholderTextColor="#999"
                />
              </View>
            </View>

            {/* Rooms List */}
            <View style={styles.roomsList}>
              {rooms
                .filter(room => room.name.toLowerCase().includes(searchRoomText.toLowerCase()))
                .map((room, index) => (
                <View key={room.id} style={styles.roomCard}>
                  <View style={styles.roomCardHeader}>
                    <View style={styles.roomBasicInfo}>
                      <Text style={styles.roomCardName}>{room.name}</Text>
                      <Text style={styles.roomCardDescription}>{room.description}</Text>
                    </View>
                    <Text style={styles.roomId}>ID: {room.id}</Text>
                  </View>

                  <View style={styles.roomCardDetails}>
                    <Text style={styles.roomDetailText}>
                      <Text style={styles.roomDetailLabel}>Owner:</Text> {room.managedBy || room.createdBy}
                    </Text>
                    <Text style={styles.roomDetailText}>
                      <Text style={styles.roomDetailLabel}>Members:</Text> {room.members || 0}/{room.maxMembers || 25}
                    </Text>
                    <Text style={styles.roomDetailText}>
                      <Text style={styles.roomDetailLabel}>Created:</Text> {room.createdAt ? new Date(room.createdAt).toLocaleDateString() : 'Unknown'}
                    </Text>
                  </View>

                  <View style={styles.roomCardActions}>
                    <TouchableOpacity
                      style={styles.editRoomButton}
                      onPress={() => openEditRoomModal(room)}
                    >
                      <Ionicons name="create-outline" size={16} color="#673AB7" />
                      <Text style={styles.editRoomButtonText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteRoomButton}
                      onPress={() => deleteRoom(room.id, room.name)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F44336" />
                      <Text style={styles.deleteRoomButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {rooms.filter(room => room.name.toLowerCase().includes(searchRoomText.toLowerCase())).length === 0 && !roomsLoading && (
                <View style={styles.emptyRoomsList}>
                  <Ionicons name="chatbubbles-outline" size={40} color="#ccc" />
                  <Text style={styles.emptyRoomsText}>
                    {searchRoomText ? 'No rooms found matching your search' : 'No rooms available'}
                  </Text>
                </View>
              )}
            </View>

            {/* Edit Room Modal */}
            {showEditRoomModal && (
              <Modal
                visible={showEditRoomModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowEditRoomModal(false)}
              >
                <SafeAreaView style={styles.editRoomModal}>
                  <View style={styles.editRoomHeader}>
                    <TouchableOpacity
                      onPress={() => setShowEditRoomModal(false)}
                      style={styles.editRoomCloseButton}
                    >
                      <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                    <Text style={styles.editRoomTitle}>Edit Room</Text>
                    <TouchableOpacity
                      onPress={saveRoomChanges}
                      disabled={editingRoom}
                      style={[styles.editRoomSaveButton, editingRoom && styles.editRoomSaveButtonDisabled]}
                    >
                      {editingRoom ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.editRoomSaveButtonText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.editRoomContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.editFormSection}>
                      <Text style={styles.editFormLabel}>Room Name *</Text>
                      <TextInput
                        style={styles.editFormInput}
                        placeholder="Enter room name"
                        value={editRoomName}
                        onChangeText={setEditRoomName}
                        maxLength={50}
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormSection}>
                      <Text style={styles.editFormLabel}>Description *</Text>
                      <TextInput
                        style={[styles.editFormInput, styles.editFormInputMultiline]}
                        placeholder="Enter room description"
                        value={editRoomDescription}
                        onChangeText={setEditRoomDescription}
                        maxLength={200}
                        multiline
                        numberOfLines={3}
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormSection}>
                      <Text style={styles.editFormLabel}>Owner/Manager</Text>
                      <TextInput
                        style={styles.editFormInput}
                        placeholder="Enter owner username"
                        value={editRoomOwner}
                        onChangeText={setEditRoomOwner}
                        maxLength={50}
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.editFormSection}>
                      <Text style={styles.editFormLabel}>Category *</Text>
                      <View style={styles.categoryPickerContainer}>
                        <TouchableOpacity
                          style={[
                            styles.categoryOption,
                            editRoomCategory === 'social' && styles.categoryOptionActive
                          ]}
                          onPress={() => setEditRoomCategory('social')}
                        >
                          <Ionicons 
                            name="people" 
                            size={20} 
                            color={editRoomCategory === 'social' ? '#fff' : '#666'} 
                          />
                          <Text style={[
                            styles.categoryOptionText,
                            editRoomCategory === 'social' && styles.categoryOptionTextActive
                          ]}>Social</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={[
                            styles.categoryOption,
                            editRoomCategory === 'game' && styles.categoryOptionActive
                          ]}
                          onPress={() => setEditRoomCategory('game')}
                        >
                          <Ionicons 
                            name="game-controller" 
                            size={20} 
                            color={editRoomCategory === 'game' ? '#fff' : '#666'} 
                          />
                          <Text style={[
                            styles.categoryOptionText,
                            editRoomCategory === 'game' && styles.categoryOptionTextActive
                          ]}>Game</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.editFormSection}>
                      <Text style={styles.editFormLabel}>Maximum Capacity</Text>
                      <TextInput
                        style={styles.editFormInput}
                        placeholder="Enter maximum capacity (e.g., 50)"
                        value={editRoomMaxMembersInput}
                        onChangeText={(text) => {
                          const filtered = text.replace(/[^0-9]/g, '').slice(0, 4);
                          setEditRoomMaxMembersInput(filtered);
                          
                          if (filtered === '') {
                            setEditRoomMaxMembers(0);
                          } else {
                            const num = parseInt(filtered, 10);
                            if (!isNaN(num)) {
                              setEditRoomMaxMembers(num);
                            }
                          }
                        }}
                        onBlur={() => {
                          if (editRoomMaxMembersInput === '' || editRoomMaxMembers === 0) {
                            setEditRoomMaxMembersInput(editRoomMaxMembers > 0 ? editRoomMaxMembers.toString() : '25');
                            setEditRoomMaxMembers(editRoomMaxMembers > 0 ? editRoomMaxMembers : 25);
                          }
                        }}
                        keyboardType="numeric"
                        maxLength={4}
                        placeholderTextColor="#999"
                      />
                    </View>
                  </ScrollView>
                </SafeAreaView>
              </Modal>
            )}
          </ScrollView>
        );

      case 'status':
        return (
          <ScrollView style={styles.statusContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusTitle}>User Status & Information</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={loadUserStatus}
                disabled={statusLoading}
              >
                {statusLoading ? (
                  <ActivityIndicator size="small" color="#FF6B35" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#FF6B35" />
                )}
              </TouchableOpacity>
            </View>

            {userStatusList.map((user, index) => (
              <View key={`user-status-${user.id}-${index}`} style={styles.userStatusCard}>
                <View style={styles.userStatusHeader}>
                  <View style={styles.userBasicInfo}>
                    <Text style={styles.userStatusName}>{user.username}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: user.status === 'online' ? '#4CAF50' : '#999' }]}>
                      <Text style={styles.statusBadgeText}>{user.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.userRole}>{user.role}</Text>
                </View>

                <View style={styles.userDetailInfo}>
                  <Text style={styles.infoLabel}>Email: <Text style={styles.infoValue}>{user.email}</Text></Text>
                  <Text style={styles.infoLabel}>Phone: <Text style={styles.infoValue}>{user.phone || 'N/A'}</Text></Text>
                  <Text style={styles.infoLabel}>Credits: <Text style={styles.infoValue}>{user.credits}</Text></Text>
                  <Text style={styles.infoLabel}>Device: <Text style={styles.infoValue}>{user.device}</Text></Text>
                  <Text style={styles.infoLabel}>IP: <Text style={styles.infoValue}>{user.ip}</Text></Text>
                  <Text style={styles.infoLabel}>Location: <Text style={styles.infoValue}>{user.location}</Text></Text>
                  <Text style={styles.infoLabel}>Last Login: <Text style={styles.infoValue}>
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </Text></Text>
                </View>

                <View style={styles.userActions}>
                  <TouchableOpacity
                    style={styles.historyButton}
                    onPress={() => {
                      setSelectedUserForHistory(user);
                      loadUserCreditHistory(user.id);
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color="#FF6B35" />
                    <Text style={styles.historyButtonText}>Credit History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.banButton}
                    onPress={() => {
                      Alert.alert(
                        'Ban Options',
                        `Choose ban action for ${user.username}:`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Ban Device',
                            onPress: () => handleBanDevice(user.id, user.username, user.device || 'unknown', user.ip || 'unknown')
                          },
                          {
                            text: 'Ban IP',
                            onPress: () => handleBanIP(user.id, user.username, user.ip || 'unknown')
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="ban-outline" size={16} color="#F44336" />
                    <Text style={styles.banButtonText}>Ban User</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {selectedUserForHistory && (
              <View style={styles.historyModal}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Credit History - {selectedUserForHistory.username}</Text>
                  <TouchableOpacity onPress={() => setSelectedUserForHistory(null)}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.historyList} contentContainerStyle={styles.historyList}>
                  {userCreditHistory.map((transaction, index) => (
                    <View key={index} style={styles.historyItem}>
                      <Text style={styles.historyAmount}>
                        {transaction.type === 'receive' ? '+' : '-'}{transaction.amount}
                      </Text>
                      <Text style={styles.historyType}>{transaction.type}</Text>
                      <Text style={styles.historyOther}>{transaction.otherParty}</Text>
                      <Text style={styles.historyDate}>
                        {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'Unknown'}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        );

      case 'ban-manage':
        return (
          <ScrollView style={styles.banManageContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.banManageHeader}>
              <Text style={styles.banManageTitle}>Ban Management System</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => {
                  loadBannedDevices();
                  loadUserStatus();
                }}
                disabled={banLoading}
              >
                {banLoading ? (
                  <ActivityIndicator size="small" color="#E91E63" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#E91E63" />
                )}
              </TouchableOpacity>
            </View>

            {/* Current Device Info */}
            <View style={styles.currentDeviceSection}>
              <Text style={styles.sectionTitle}>Current Device Information</Text>
              <View style={styles.deviceInfoCard}>
                <View style={styles.deviceInfoRow}>
                  <Ionicons name="phone-portrait-outline" size={16} color="#666" />
                  <Text style={styles.deviceInfoLabel}>Device:</Text>
                  <Text style={styles.deviceInfoValue}>{deviceInfo.brand} {deviceInfo.modelName}</Text>
                </View>
                <View style={styles.deviceInfoRow}>
                  <Ionicons name="hardware-chip-outline" size={16} color="#666" />
                  <Text style={styles.deviceInfoLabel}>Type:</Text>
                  <Text style={styles.deviceInfoValue}>{deviceInfo.deviceType}</Text>
                </View>
                <View style={styles.deviceInfoRow}>
                  <Ionicons name="person-outline" size={16} color="#666" />
                  <Text style={styles.deviceInfoLabel}>User:</Text>
                  <Text style={styles.deviceInfoValue}>{user?.username}</Text>
                </View>
              </View>
            </View>

            {/* Active Users with Device Info */}
            <View style={styles.activeUsersSection}>
              <Text style={styles.sectionTitle}>Active Users</Text>
              {userStatusList.map((userItem, index) => (
                <View key={`active-user-${userItem.id}-${index}`} style={styles.deviceInfoCard}>
                  <View style={styles.userDeviceHeader}>
                    <View style={styles.userBasicInfo}>
                      <Text style={styles.userDeviceName}>{userItem.username}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: userItem.status === 'online' ? '#4CAF50' : '#999' }]}>
                        <Text style={styles.statusBadgeText}>{userItem.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.userRole}>{userItem.role}</Text>
                  </View>

                  <View style={styles.deviceDetailInfo}>
                    <View style={styles.deviceInfoRow}>
                      <Ionicons name="phone-portrait-outline" size={16} color="#666" />
                      <Text style={styles.deviceInfoLabel}>Device:</Text>
                      <Text style={styles.deviceInfoValue}>{userItem.device || 'Unknown'}</Text>
                    </View>

                    <View style={styles.deviceInfoRow}>
                      <Ionicons name="globe-outline" size={16} color="#666" />
                      <Text style={styles.deviceInfoLabel}>IP Address:</Text>
                      <Text style={styles.deviceInfoValue}>{userItem.ip || 'Unknown'}</Text>
                    </View>

                    <View style={styles.deviceInfoRow}>
                      <Ionicons name="location-outline" size={16} color="#666" />
                      <Text style={styles.deviceInfoLabel}>Location:</Text>
                      <Text style={styles.deviceInfoValue}>{userItem.location || 'Unknown'}</Text>
                    </View>

                    <View style={styles.deviceInfoRow}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={styles.deviceInfoLabel}>Last Login:</Text>
                      <Text style={styles.deviceInfoValue}>
                        {userItem.lastLogin ? new Date(userItem.lastLogin).toLocaleString() : 'Never'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.banActions}>
                    <TouchableOpacity
                      style={[styles.banActionButton, styles.banDeviceButton]}
                      onPress={() => handleBanDevice(userItem.id, userItem.username, userItem.device || `${userItem.username}_device`, userItem.ip || 'unknown')}
                      disabled={banLoading}
                    >
                      <Ionicons name="phone-portrait" size={16} color="#fff" />
                      <Text style={styles.banActionText}>Ban Device</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.banActionButton, styles.banIpButton]}
                      onPress={() => handleBanIP(userItem.id, userItem.username, userItem.ip || 'unknown')}
                      disabled={banLoading}
                    >
                      <Ionicons name="shield-outline" size={16} color="#fff" />
                      <Text style={styles.banActionText}>Ban IP</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Banned Devices and IPs List */}
            <View style={styles.bannedListSection}>
              <Text style={styles.sectionTitle}>Banned Devices & IPs</Text>

              {bannedDevicesList.map((banned, index) => (
                <View key={banned.id || index} style={styles.bannedItemCard}>
                  <View style={styles.bannedItemHeader}>
                    <View style={styles.bannedItemInfo}>
                      <Text style={styles.bannedUsername}>User ID: {banned.userId}</Text>
                      <Text style={styles.bannedType}>{banned.type.toUpperCase()} Ban</Text>
                    </View>
                    <Text style={styles.bannedDate}>
                      {banned.bannedAt ? new Date(banned.bannedAt).toLocaleDateString() : 'Unknown'}
                    </Text>
                  </View>

                  <View style={styles.bannedDetails}>
                    <Text style={styles.bannedDetailText}>
                      <Text style={styles.bannedDetailLabel}>Target:</Text> {banned.target}
                    </Text>
                    <Text style={styles.bannedDetailText}>
                      <Text style={styles.bannedDetailLabel}>Reason:</Text> {banned.reason || 'No reason provided'}
                    </Text>
                    <Text style={styles.bannedDetailText}>
                      <Text style={styles.bannedDetailLabel}>Banned By:</Text> {banned.bannedBy}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.unbanButton}
                    onPress={() => handleUnban(banned.id, banned.type, banned.target)}
                    disabled={banLoading}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                    <Text style={styles.unbanButtonText}>Unban</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {bannedDevicesList.length === 0 && !banLoading && (
                <View style={styles.emptyBannedList}>
                  <Ionicons name="shield-checkmark" size={40} color="#ccc" />
                  <Text style={styles.emptyBannedText}>No banned devices or IPs</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );

      case 'support-tickets':
        return (
          <ScrollView style={styles.ticketsContainer} showsVerticalScrollIndicator={false}>
            {/* Stats Cards */}
            {ticketStats && (
              <View style={styles.ticketStatsRow}>
                <View style={[styles.statCard, { borderLeftColor: '#4CAF50' }]}>
                  <Text style={styles.statNumber}>{ticketStats.open_count || 0}</Text>
                  <Text style={styles.statLabel}>Open</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: '#FF9800' }]}>
                  <Text style={styles.statNumber}>{ticketStats.in_progress_count || 0}</Text>
                  <Text style={styles.statLabel}>In Progress</Text>
                </View>
                <View style={[styles.statCard, { borderLeftColor: '#2196F3' }]}>
                  <Text style={styles.statNumber}>{ticketStats.resolved_count || 0}</Text>
                  <Text style={styles.statLabel}>Resolved</Text>
                </View>
              </View>
            )}

            {/* Filter Buttons */}
            <View style={styles.filterButtonsRow}>
              <TouchableOpacity
                style={[styles.filterButton, ticketStatusFilter === 'all' && styles.filterButtonActive]}
                onPress={() => setTicketStatusFilter('all')}
              >
                <Text style={[styles.filterButtonText, ticketStatusFilter === 'all' && styles.filterButtonTextActive]}>
                  Semua
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, ticketStatusFilter === 'open' && styles.filterButtonActive]}
                onPress={() => setTicketStatusFilter('open')}
              >
                <Text style={[styles.filterButtonText, ticketStatusFilter === 'open' && styles.filterButtonTextActive]}>
                  Open
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, ticketStatusFilter === 'in_progress' && styles.filterButtonActive]}
                onPress={() => setTicketStatusFilter('in_progress')}
              >
                <Text style={[styles.filterButtonText, ticketStatusFilter === 'in_progress' && styles.filterButtonTextActive]}>
                  In Progress
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, ticketStatusFilter === 'resolved' && styles.filterButtonActive]}
                onPress={() => setTicketStatusFilter('resolved')}
              >
                <Text style={[styles.filterButtonText, ticketStatusFilter === 'resolved' && styles.filterButtonTextActive]}>
                  Resolved
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tickets List */}
            {ticketsLoading ? (
              <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 20 }} />
            ) : tickets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="mail-outline" size={60} color="#ccc" />
                <Text style={styles.emptyTitle}>No Tickets</Text>
                <Text style={styles.emptySubtitle}>Tidak ada tiket support untuk filter ini</Text>
              </View>
            ) : (
              tickets.map((ticket: any) => (
                <TouchableOpacity
                  key={ticket.id}
                  style={styles.ticketCard}
                  onPress={() => openTicketDetail(ticket)}
                >
                  <View style={styles.ticketHeader}>
                    <View style={styles.ticketTitleRow}>
                      <Ionicons name="ticket-outline" size={18} color="#2196F3" />
                      <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                    </View>
                    <View style={[styles.ticketStatusBadge, { backgroundColor: getTicketStatusColor(ticket.status) }]}>
                      <Text style={styles.ticketStatusText}>{ticket.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketDescription} numberOfLines={2}>{ticket.description}</Text>
                  <View style={styles.ticketFooter}>
                    <Text style={styles.ticketUsername}>
                      <Ionicons name="person-outline" size={12} /> {ticket.username}
                    </Text>
                    <Text style={styles.ticketDate}>
                      {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : 'Unknown'}
                    </Text>
                  </View>
                  {ticket.messageCount > 0 && (
                    <View style={styles.ticketMessageCount}>
                      <Ionicons name="chatbubble-outline" size={12} color="#666" />
                      <Text style={styles.ticketMessageCountText}>{ticket.messageCount} pesan</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}

            {/* Ticket Detail Modal */}
            <Modal
              visible={showTicketDetailModal}
              animationType="slide"
              transparent={false}
              onRequestClose={() => {
                setShowTicketDetailModal(false);
                setSelectedTicket(null);
                setTicketMessages([]);
                setTicketReply('');
              }}
            >
              <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity onPress={() => {
                    setShowTicketDetailModal(false);
                    setSelectedTicket(null);
                    setTicketMessages([]);
                    setTicketReply('');
                  }}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Detail Tiket</Text>
                  <View style={{ width: 24 }} />
                </View>

                {selectedTicket && (
                  <ScrollView style={styles.ticketDetailContainer}>
                    {/* Ticket Info */}
                    <View style={styles.ticketDetailCard}>
                      <Text style={styles.ticketDetailSubject}>{selectedTicket.subject}</Text>
                      <Text style={styles.ticketDetailDescription}>{selectedTicket.description}</Text>
                      <View style={styles.ticketDetailMeta}>
                        <Text style={styles.ticketDetailMetaText}>
                          User: <Text style={{ fontWeight: '600' }}>{selectedTicket.username}</Text>
                        </Text>
                        <Text style={styles.ticketDetailMetaText}>
                          Category: <Text style={{ fontWeight: '600' }}>{selectedTicket.category}</Text>
                        </Text>
                        <Text style={styles.ticketDetailMetaText}>
                          Priority: <Text style={{ fontWeight: '600' }}>{selectedTicket.priority}</Text>
                        </Text>
                        <Text style={styles.ticketDetailMetaText}>
                          Created: <Text style={{ fontWeight: '600' }}>
                            {selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleString() : 'Unknown'}
                          </Text>
                        </Text>
                      </View>

                      {/* Status Actions */}
                      <View style={styles.statusActionsRow}>
                        <TouchableOpacity
                          style={[styles.statusActionButton, selectedTicket.status === 'in_progress' && styles.statusActionButtonActive]}
                          onPress={() => handleUpdateTicketStatus(selectedTicket.id, 'in_progress')}
                          disabled={selectedTicket.status === 'in_progress'}
                        >
                          <Text style={styles.statusActionButtonText}>In Progress</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.statusActionButton, selectedTicket.status === 'resolved' && styles.statusActionButtonActive]}
                          onPress={() => handleUpdateTicketStatus(selectedTicket.id, 'resolved')}
                          disabled={selectedTicket.status === 'resolved'}
                        >
                          <Text style={styles.statusActionButtonText}>Resolved</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.statusActionButton, selectedTicket.status === 'closed' && styles.statusActionButtonActive]}
                          onPress={() => handleUpdateTicketStatus(selectedTicket.id, 'closed')}
                          disabled={selectedTicket.status === 'closed'}
                        >
                          <Text style={styles.statusActionButtonText}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Messages */}
                    <Text style={styles.messagesTitle}>Percakapan</Text>
                    {ticketMessages.map((msg: any) => (
                      <View
                        key={msg.id}
                        style={[
                          styles.messageCard,
                          msg.isAdmin && styles.adminMessageCard
                        ]}
                      >
                        <View style={styles.messageHeader}>
                          <Text style={[styles.messageSender, msg.isAdmin && styles.adminMessageSender]}>
                            {msg.username} {msg.isAdmin && '(Admin)'}
                          </Text>
                          <Text style={styles.messageTime}>
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'Unknown'}
                          </Text>
                        </View>
                        <Text style={styles.messageText}>{msg.message}</Text>
                      </View>
                    ))}

                    {/* Reply Input */}
                    <View style={styles.replySection}>
                      <Text style={styles.replyTitle}>Balas Tiket</Text>
                      <TextInput
                        style={styles.replyInput}
                        value={ticketReply}
                        onChangeText={setTicketReply}
                        placeholder="Tulis balasan Anda..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                      />
                      <TouchableOpacity
                        style={styles.replyButton}
                        onPress={handleReplyToTicket}
                        disabled={!ticketReply.trim()}
                      >
                        <Ionicons name="send" size={20} color="#fff" />
                        <Text style={styles.replyButtonText}>Kirim Balasan</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}
              </SafeAreaView>
            </Modal>
          </ScrollView>
        );

      case 'gift-report':
        return (
          <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
            <Text style={styles.reportSectionTitle}>Download Laporan Gift Earnings</Text>
            <Text style={styles.reportSectionSubtitle}>
              Download laporan pendapatan dari gift dalam format CSV untuk analisis keuangan
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Filter Bulan (Optional)</Text>
              <View style={styles.pickerContainer}>
                <TextInput
                  style={styles.formInput}
                  value={reportMonth}
                  onChangeText={setReportMonth}
                  placeholder="Pilih bulan (1-12) atau kosongkan untuk semua"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tahun</Text>
              <TextInput
                style={styles.formInput}
                value={reportYear}
                onChangeText={setReportYear}
                placeholder="Contoh: 2025"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={4}
              />
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={24} color="#009688" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.infoBoxTitle}>Format Laporan CSV</Text>
                <Text style={styles.infoBoxText}>
                  • Tanggal & Jam transaksi{'\n'}
                  • Pengirim & Penerima{'\n'}
                  • Nama & Harga Gift{'\n'}
                  • Bagian User (30%){'\n'}
                  • Bagian System (70%){'\n'}
                  • Total & Ringkasan
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.addButton,
                { backgroundColor: '#009688' },
                downloadingReport && { opacity: 0.6 }
              ]}
              onPress={async () => {
                if (downloadingReport) return;

                try {
                  setDownloadingReport(true);

                  // Build URL with query params
                  let url = `${API_BASE_URL}/admin/reports/gift-earnings-csv`;
                  const params = [];
                  
                  if (reportMonth && parseInt(reportMonth) >= 1 && parseInt(reportMonth) <= 12) {
                    params.push(`month=${reportMonth}`);
                  }
                  
                  if (reportYear && reportYear.length === 4) {
                    params.push(`year=${reportYear}`);
                  }

                  if (params.length > 0) {
                    url += '?' + params.join('&');
                  }

                  const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'text/csv',
                    },
                  });

                  if (!response.ok) {
                    throw new Error('Failed to download report');
                  }

                  const csvContent = await response.text();

                  // For web platform, trigger download
                  if (typeof window !== 'undefined' && window.document) {
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    const urlBlob = URL.createObjectURL(blob);
                    
                    let filename = 'laporan-gift-earnings';
                    if (reportMonth && reportYear) {
                      filename += `-${reportYear}-${String(reportMonth).padStart(2, '0')}`;
                    } else if (reportYear) {
                      filename += `-${reportYear}`;
                    }
                    filename += '.csv';

                    link.href = urlBlob;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(urlBlob);

                    Alert.alert(
                      'Berhasil!',
                      `Laporan ${filename} berhasil didownload!`,
                      [{ text: 'OK' }]
                    );
                  } else {
                    // For mobile, notify user
                    Alert.alert(
                      'Laporan Siap',
                      'Laporan CSV berhasil dibuat. Gunakan web browser untuk mendownload file.',
                      [{ text: 'OK' }]
                    );
                  }

                } catch (error) {
                  console.error('Error downloading report:', error);
                  Alert.alert(
                    'Error',
                    'Gagal mendownload laporan. Silakan coba lagi.',
                    [{ text: 'OK' }]
                  );
                } finally {
                  setDownloadingReport(false);
                }
              }}
              disabled={downloadingReport}
            >
              {downloadingReport ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Download Laporan CSV</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={[styles.infoBox, { backgroundColor: '#FFF3E0', marginTop: 20 }]}>
              <Ionicons name="calculator" size={24} color="#FF9800" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.infoBoxTitle, { color: '#FF9800' }]}>Perhitungan Pendapatan System</Text>
                <Text style={styles.infoBoxText}>
                  Setiap gift yang dikirim:{'\n'}
                  • 30% masuk ke saldo withdraw user penerima{'\n'}
                  • 70% masuk ke pendapatan system{'\n\n'}
                  Laporan ini menunjukkan total pendapatan system dari semua gift yang dikirim dalam periode yang dipilih.
                </Text>
              </View>
            </View>
          </ScrollView>
        );

      case 'withdrawals':
        const getStatusColor = (status: string) => {
          switch (status) {
            case 'pending': return '#FF9800';
            case 'completed': return '#4CAF50';
            case 'rejected': return '#F44336';
            case 'processing': return '#2196F3';
            default: return '#999';
          }
        };

        const getStatusText = (status: string) => {
          switch (status) {
            case 'pending': return 'Menunggu';
            case 'completed': return 'Selesai';
            case 'rejected': return 'Ditolak';
            case 'processing': return 'Diproses';
            default: return status;
          }
        };

        return (
          <ScrollView style={styles.withdrawalsContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.withdrawalsHeader}>
              <Text style={styles.withdrawalsTitle}>Withdrawal Requests</Text>
              <Text style={styles.withdrawalsSubtitle}>Kelola permintaan penarikan dana manual</Text>
            </View>

            {withdrawalsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4CAF50" />
                <Text style={styles.loadingText}>Memuat data...</Text>
              </View>
            ) : withdrawals.length === 0 ? (
              <View style={styles.emptyWithdrawalsContainer}>
                <Ionicons name="cash-outline" size={60} color="#ccc" />
                <Text style={styles.emptyWithdrawalsText}>Tidak ada permintaan withdrawal</Text>
              </View>
            ) : (
              withdrawals.map((withdrawal, index) => (
                <View key={`withdrawal-${withdrawal.id}-${index}`} style={styles.withdrawalCard}>
                  <View style={styles.withdrawalHeader}>
                    <View style={styles.withdrawalUserInfo}>
                      <Text style={styles.withdrawalUsername}>{withdrawal.username}</Text>
                      <Text style={styles.withdrawalEmail}>{withdrawal.email}</Text>
                    </View>
                    <View style={[styles.withdrawalStatusBadge, { backgroundColor: getStatusColor(withdrawal.status) }]}>
                      <Text style={styles.withdrawalStatusText}>{getStatusText(withdrawal.status)}</Text>
                    </View>
                  </View>

                  <View style={styles.withdrawalDetails}>
                    <View style={styles.withdrawalDetailRow}>
                      <Ionicons name="cash" size={16} color="#666" />
                      <Text style={styles.withdrawalDetailLabel}>Amount:</Text>
                      <Text style={styles.withdrawalDetailValue}>
                        ${withdrawal.amountUsd.toFixed(2)} USD ({withdrawal.amountCoins.toLocaleString()} coins)
                      </Text>
                    </View>

                    <View style={styles.withdrawalDetailRow}>
                      <Ionicons name="card" size={16} color="#666" />
                      <Text style={styles.withdrawalDetailLabel}>Net IDR:</Text>
                      <Text style={styles.withdrawalDetailValue}>
                        Rp {withdrawal.netAmountIdr.toLocaleString()}
                      </Text>
                    </View>

                    <View style={styles.withdrawalDetailRow}>
                      <Ionicons name="wallet" size={16} color="#666" />
                      <Text style={styles.withdrawalDetailLabel}>Account:</Text>
                      <Text style={styles.withdrawalDetailValue}>
                        {withdrawal.accountDetails.accountName} ({withdrawal.accountDetails.accountNumber})
                      </Text>
                    </View>

                    <View style={styles.withdrawalDetailRow}>
                      <Ionicons name="time" size={16} color="#666" />
                      <Text style={styles.withdrawalDetailLabel}>Tanggal:</Text>
                      <Text style={styles.withdrawalDetailValue}>
                        {new Date(withdrawal.createdAt).toLocaleString('id-ID')}
                      </Text>
                    </View>

                    {withdrawal.notes && (
                      <View style={styles.withdrawalNotes}>
                        <Ionicons name="information-circle" size={16} color="#999" />
                        <Text style={styles.withdrawalNotesText}>{withdrawal.notes}</Text>
                      </View>
                    )}
                  </View>

                  {withdrawal.status === 'pending' && (
                    <View style={styles.withdrawalActions}>
                      <TouchableOpacity
                        style={[styles.withdrawalActionButton, { backgroundColor: '#4CAF50' }]}
                        onPress={() => approveWithdrawal(withdrawal)}
                        disabled={processingWithdrawal}
                      >
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.withdrawalActionText}>Approve</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.withdrawalActionButton, { backgroundColor: '#F44336' }]}
                        onPress={() => openRejectModal(withdrawal)}
                        disabled={processingWithdrawal}
                      >
                        <Ionicons name="close-circle" size={20} color="#fff" />
                        <Text style={styles.withdrawalActionText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}

            {/* Reject Modal */}
            <Modal
              visible={showWithdrawalModal}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowWithdrawalModal(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.rejectModal}>
                  <Text style={styles.rejectModalTitle}>Reject Withdrawal</Text>
                  <Text style={styles.rejectModalSubtitle}>
                    Coins akan otomatis dikembalikan ke user
                  </Text>

                  <Text style={styles.formLabel}>Alasan Penolakan *</Text>
                  <TextInput
                    style={[styles.formInput, styles.rejectReasonInput]}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Contoh: Data rekening tidak valid"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={3}
                  />

                  <View style={styles.rejectModalActions}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => {
                        setShowWithdrawalModal(false);
                        setRejectReason('');
                      }}
                    >
                      <Text style={styles.modalCancelButtonText}>Batal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalRejectButton]}
                      onPress={rejectWithdrawal}
                      disabled={!rejectReason.trim() || processingWithdrawal}
                    >
                      {processingWithdrawal ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.modalRejectButtonText}>Reject & Refund</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </ScrollView>
        );

      default:
        return null;
    }
  };

  const getTicketStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#4CAF50';
      case 'in_progress': return '#FF9800';
      case 'resolved': return '#2196F3';
      case 'closed': return '#999';
      default: return '#666';
    }
  };

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.unauthorizedContainer}>
          <Ionicons name="shield-outline" size={80} color="#ccc" />
          <Text style={styles.unauthorizedTitle}>Access Denied</Text>
          <Text style={styles.unauthorizedSubtitle}>You need admin privileges to access this page</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#FF6B35', '#F7931E']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={toggleSideMenu} style={styles.menuButton}>
            <Ionicons name="menu" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getActiveMenuTitle()}</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Main Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Side Menu */}
      <Animated.View
        style={[
          styles.sideMenu,
          {
            transform: [{ translateX: slideAnim }]
          }
        ]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sideMenuHeader}
        >
          <View style={styles.sideMenuProfile}>
            <View style={styles.adminAvatar}>
              <Ionicons name="shield-checkmark" size={30} color="#fff" />
            </View>
            <Text style={styles.adminName}>{user?.username}</Text>
            <Text style={styles.adminRole}>Administrator</Text>
          </View>
          <TouchableOpacity
            style={styles.closeMenuButton}
            onPress={toggleSideMenu}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView style={styles.sideMenuContent} contentContainerStyle={styles.sideMenuScrollContent} showsVerticalScrollIndicator={false}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                activeTab === item.id && styles.activeMenuItem
              ]}
              onPress={() => selectMenuItem(item.id)}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon as any} size={20} color="#fff" />
              </View>
              <View style={styles.menuItemText}>
                <Text style={[
                  styles.menuItemTitle,
                  activeTab === item.id && styles.activeMenuItemTitle
                ]}>
                  {item.title}
                </Text>
                <Text style={styles.menuItemDescription}>{item.description}</Text>
              </View>
              {activeTab === item.id && (
                <View style={styles.activeMenuIndicator} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sideMenuFooter}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.logoutButtonText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Overlay */}
      {showSideMenu && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={toggleSideMenu}
          activeOpacity={1}
        />
      )}

      {/* Add Item Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add Gift
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder={`Enter ${activeTab} name`}
                />
              </View>

              <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Upload Gift Image/Video</Text>
                    <Text style={styles.inputSubLabel}>Supports PNG, GIF, JPG, WebM files</Text>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleGiftImageUpload}
                    >
                      <Ionicons name="image" size={24} color="#FF6B35" />
                      <Text style={styles.uploadButtonText}>
                        {uploadedGiftImage ? uploadedGiftImage.name : 'UPLOAD GIFT MEDIA'}
                      </Text>
                    </TouchableOpacity>
                    {uploadedGiftImage && (
                      <View style={styles.previewContainer}>
                        <Image source={{ uri: uploadedGiftImage.uri }} style={styles.giftImagePreview} />
                        <TouchableOpacity
                          style={styles.removeFileButton}
                          onPress={() => setUploadedGiftImage(null)}
                        >
                          <Ionicons name="close-circle" size={20} color="#F44336" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Icon (Fallback)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={itemIcon}
                      onChangeText={setItemIcon}
                      placeholder="🎁"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Category</Text>
                    <Text style={styles.inputSubLabel}>Categories except "lucky" will be shown</Text>
                    <TextInput
                      style={styles.textInput}
                      value={itemCategory}
                      onChangeText={setItemCategory}
                      placeholder="popular, bangsa, set kostum, tas saya"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Price (Credits)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={itemPrice}
                      onChangeText={setItemPrice}
                      placeholder="100"
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Animation File (Optional)</Text>
                    <TouchableOpacity
                      style={styles.fileUploadButton}
                      onPress={handleFileUpload}
                    >
                      <Ionicons name="cloud-upload-outline" size={20} color="#666" />
                      <Text style={styles.fileUploadText}>
                        {selectedFile ? selectedFile.name : 'Upload GIF/JSON/Lottie'}
                      </Text>
                    </TouchableOpacity>
                  </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleAddItem}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? 'Adding...' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Gift Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>Edit Gift</Text>
              <TouchableOpacity
                style={styles.editModalCloseButton}
                onPress={() => setShowEditModal(false)}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.editModalContent}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Nama Gift</Text>
                <TextInput
                  style={styles.formInput}
                  value={editGiftName}
                  onChangeText={setEditGiftName}
                  placeholder="Masukkan nama gift..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Harga Gift (Credits)</Text>
                <TextInput
                  style={styles.formInput}
                  value={editGiftPrice}
                  onChangeText={setEditGiftPrice}
                  placeholder="Masukkan harga..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.editModalActions}>
                <TouchableOpacity
                  style={styles.editModalCancelButton}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.editModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editModalDeleteButton}
                  onPress={() => {
                    setShowEditModal(false);
                    if (editingGift) {
                      handleDeleteItem(editingGift.id, 'gift');
                    }
                  }}
                >
                  <Text style={styles.editModalDeleteText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editModalSaveButton}
                  onPress={handleUpdateGift}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.editModalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Transfer History Modal */}
      <AdminTransferHistoryModal
        visible={showTransferHistoryModal}
        onClose={() => setShowTransferHistoryModal(false)}
      />
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
  },
  menuButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addButton: {
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // Side Menu Styles
  sideMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth * 0.75,
    height: '100%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
    zIndex: 1000,
  },
  sideMenuHeader: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  sideMenuProfile: {
    alignItems: 'center',
  },
  adminAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  adminName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  adminRole: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  closeMenuButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 8,
  },
  sideMenuContent: {
    flex: 1,
    paddingTop: 20,
  },
  sideMenuScrollContent: {
    paddingTop: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 12,
    marginVertical: 2,
    borderRadius: 12,
    position: 'relative',
  },
  activeMenuItem: {
    backgroundColor: '#F8F9FA',
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activeMenuItemTitle: {
    color: '#FF6B35',
  },
  menuItemDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  activeMenuIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B35',
    position: 'absolute',
    right: 16,
  },
  sideMenuFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
    fontWeight: '500',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  // Coming Soon Style
  banManageContainer: {
    flex: 1,
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E91E63',
    marginTop: 16,
    marginBottom: 8,
  },
  comingSoonSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 24,
  },
  // Existing styles remain the same
  listContainer: {
    flexGrow: 1,
  },
  itemCard: {
    flex: 1,
    backgroundColor: '#fff',
    margin: 4,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemEmoji: {
    fontSize: 24,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#ffebee',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 12,
    color: '#666',
  },
  itemPrice: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '600',
  },
  itemType: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  fileUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
  },
  fileUploadText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  saveButton: {
    backgroundColor: '#FF6B35',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  unauthorizedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 20,
    marginBottom: 10,
  },
  unauthorizedSubtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 30,
  },
  backButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFF8F0',
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
    marginLeft: 8,
  },
  previewContainer: {
    alignItems: 'center',
    marginTop: 12,
    position: 'relative',
  },
  removeFileButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  inputSubLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  giftDisplayContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  giftItemImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  giftImagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  userSearchContainer: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  searchButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
  },
  userCard: {
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  adminBtn: {
    backgroundColor: '#F44336',
  },
  mentorBtn: {
    backgroundColor: '#FF9800',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  giftFormContainer: {
    flex: 1,
  },
  giftFormCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
  uploadFormButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#FFF5F2',
  },
  uploadFormText: {
    fontSize: 16,
    color: '#FF6B35',
    marginLeft: 10,
    fontWeight: '500',
  },
  formPreviewContainer: {
    marginTop: 12,
    position: 'relative',
    alignItems: 'center',
  },
  formPreviewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  formRemoveButton: {
    position: 'absolute',
    top: -5,
    right: 5,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  formFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  formFileName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  giftListContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  giftListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  giftGrid: {
    paddingBottom: 10,
  },
  giftGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  giftCard: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  giftName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
  },
  giftPrice: {
    fontSize: 11,
    color: '#FF6B35',
    fontWeight: '500',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  emptyGiftList: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyGiftText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
  creditTransferContainer: {
    flex: 1,
    padding: 16,
  },
  creditTransferCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  creditTransferTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  creditTransferSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  creditInputGroup: {
    marginBottom: 20,
  },
  creditInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  creditInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  transferButtonContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  transferButton: {
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 25,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  transferButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  statusContainer: {
    flex: 1,
    padding: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFF5F2',
  },
  userStatusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userStatusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userBasicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userStatusName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  userRole: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  userDetailInfo: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    color: '#333',
    fontWeight: '500',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  historyButtonText: {
    color: '#FF6B35',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  banButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  banButtonText: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  historyModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  historyList: {
    maxHeight: 300,
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    width: 60,
  },
  historyType: {
    fontSize: 12,
    color: '#666',
    width: 60,
  },
  historyOther: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
  historyDate: {
    fontSize: 10,
    color: '#999',
    width: 80,
  },
  // Ban Management Styles
  banManageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  banManageTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  currentDeviceSection: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  activeUsersSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceInfoCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#E91E63',
  },
  userDeviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userDeviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  deviceDetailInfo: {
    marginBottom: 12,
  },
  deviceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceInfoLabel: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    marginRight: 8,
    minWidth: 80,
  },
  deviceInfoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  banActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  banActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  banDeviceButton: {
    backgroundColor: '#FF5722',
  },
  banIpButton: {
    backgroundColor: '#F44336',
  },
  banActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  bannedListSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannedItemCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  bannedItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannedItemInfo: {
    flex: 1,
  },
  bannedUsername: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  bannedType: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  bannedDate: {
    fontSize: 12,
    color: '#666',
  },
  bannedDetails: {
    marginBottom: 12,
  },
  bannedDetailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bannedDetailLabel: {
    fontWeight: '600',
    color: '#333',
  },
  unbanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  unbanButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyBannedList: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyBannedText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
  // Banner Management Styles
  bannerContainer: {
    flex: 1,
  },
  bannerFormCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerPreviewImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  bannerListContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  bannerCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  bannerCardImage: {
    width: '100%',
    height: 80,
    borderRadius: 6,
    marginBottom: 8,
  },
  bannerCardContent: {
    flex: 1,
  },
  bannerCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  bannerCardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  bannerCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bannerCardOrder: {
    fontSize: 12,
    color: '#999',
  },
  bannerCardClicks: {
    fontSize: 12,
    color: '#999',
  },
  deleteBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  deleteBannerText: {
    color: '#F44336',
    fontSize: 12,
    marginLeft: 5,
  },
  emptyBannerList: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyBannerText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },

  // Room Management Styles
  roomManageContainer: {
    flex: 1,
    padding: 16,
  },
  roomManageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  roomManageTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  searchRoomContainer: {
    marginBottom: 20,
  },
  searchTextInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
  },
  roomsList: {
    flex: 1,
  },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  roomBasicInfo: {
    flex: 1,
  },
  roomCardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  roomCardDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  roomId: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  roomCardDetails: {
    marginBottom: 12,
  },
  roomDetailText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  roomDetailLabel: {
    fontWeight: '600',
    color: '#333',
  },
  roomCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
  },
  editRoomButtonText: {
    color: '#673AB7',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  deleteRoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  deleteRoomButtonText: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyRoomsList: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyRoomsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
  // Edit Room Modal Styles
  editRoomModal: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  editRoomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  editRoomCloseButton: {
    padding: 4,
  },
  editRoomTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  editRoomSaveButton: {
    backgroundColor: '#673AB7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editRoomSaveButtonDisabled: {
    opacity: 0.6,
  },
  editRoomSaveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  editRoomContent: {
    flex: 1,
    padding: 20,
  },
  editFormSection: {
    marginBottom: 20,
  },
  editFormLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  editFormInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#374151',
  },
  editFormInputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryPickerContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  categoryOptionActive: {
    backgroundColor: '#673AB7',
    borderColor: '#673AB7',
  },
  categoryOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  categoryOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  capacityEditContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  capacityEditOption: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  capacityEditOptionSelected: {
    borderColor: '#673AB7',
    backgroundColor: '#f3f4f6',
  },
  capacityEditOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  capacityEditOptionTextSelected: {
    color: '#673AB7',
    fontWeight: '600',
  },

  // Video preview styles
  videoPreviewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 20,
    marginTop: 10,
  },
  videoPreviewText: {
    marginTop: 8,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  videoDurationText: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },

  // Gift Edit Styles
  giftActionButtons: {
    flexDirection: 'row',
    gap: 5,
  },
  editButton: {
    backgroundColor: '#e3f2fd',
    padding: 6,
    borderRadius: 4,
  },
  editModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  editModalCloseButton: {
    padding: 4,
  },
  editModalContent: {
    gap: 15,
  },
  editModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  editModalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  editModalCancelText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  editModalSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#FF6B35',
  },
  editModalSaveText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Gift Grid Styles
  giftGridListContainer: {
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  giftGridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  giftGridCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 4,
    maxWidth: '30%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    overflow: 'hidden',
  },
  giftGridImageContainer: {
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: '#f8f9fa',
  },
  giftGridImage: {
    width: '100%',
    height: '100%',
  },
  giftGridEmojiContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  giftGridEmoji: {
    fontSize: 32,
    textAlign: 'center',
  },
  giftGridOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(255, 107, 53, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderTopLeftRadius: 8,
  },
  giftGridPrice: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  videoIndicatorBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftGridInfo: {
    padding: 8,
  },
  giftGridName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  giftGridCategory: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  giftHelpText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 10,
    textAlign: 'center',
  },
  editModalDeleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F44336',
  },
  editModalDeleteText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Support Tickets Styles
  ticketsContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  ticketStatsRow: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    gap: 8,
    marginBottom: 15,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  ticketCard: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 12,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  ticketStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ticketStatusText: {
    fontSize: 11,
    color: 'white',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ticketDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  ticketUsername: {
    fontSize: 12,
    color: '#999',
  },
  ticketDate: {
    fontSize: 12,
    color: '#999',
  },
  ticketMessageCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  ticketMessageCountText: {
    fontSize: 11,
    color: '#666',
  },
  ticketDetailContainer: {
    flex: 1,
    padding: 15,
  },
  ticketDetailCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  ticketDetailSubject: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  ticketDetailDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  ticketDetailMeta: {
    gap: 6,
  },
  ticketDetailMetaText: {
    fontSize: 13,
    color: '#666',
  },
  statusActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
  },
  statusActionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusActionButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  statusActionButtonText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  messagesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  messageCard: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  adminMessageCard: {
    backgroundColor: '#E3F2FD',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  messageSender: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  adminMessageSender: {
    color: '#2196F3',
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
  },
  messageText: {
    fontSize: 14,
    color: '#666',
  },
  replySection: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  replyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  replyInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  replyButton: {
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  replyButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  statsContainer: {
    flex: 1,
    padding: 20,
  },
  statsCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 200,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 24,
    backgroundColor: '#4ECDC4',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    marginTop: 5,
  },
  dateLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  createAccountContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  reportSectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  createAccountButton: {
    backgroundColor: '#4ECDC4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
    gap: 8,
  },
  createAccountButtonDisabled: {
    opacity: 0.6,
  },
  createAccountButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  pickerContainer: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E0F2F1',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  infoBoxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#009688',
    marginBottom: 8,
  },
  infoBoxText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  
  // Withdrawal Management Styles
  withdrawalsContainer: {
    flex: 1,
    padding: 20,
  },
  withdrawalsHeader: {
    marginBottom: 20,
  },
  withdrawalsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  withdrawalsSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  emptyWithdrawalsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyWithdrawalsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  withdrawalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  withdrawalUserInfo: {
    flex: 1,
  },
  withdrawalUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  withdrawalEmail: {
    fontSize: 14,
    color: '#666',
  },
  withdrawalStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  withdrawalStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  withdrawalDetails: {
    marginBottom: 12,
  },
  withdrawalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  withdrawalDetailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    minWidth: 80,
  },
  withdrawalDetailValue: {
    fontSize: 14,
    color: '#1f2937',
    flex: 1,
  },
  withdrawalNotes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  withdrawalNotesText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  withdrawalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  withdrawalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  withdrawalActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  rejectModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  rejectModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  rejectReasonInput: {
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  rejectModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f3f4f6',
  },
  modalCancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  modalRejectButton: {
    backgroundColor: '#F44336',
  },
  modalRejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});