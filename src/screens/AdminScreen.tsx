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

const { width: screenWidth } = Dimensions.get('window');

interface Emoji {
  id: string;
  name: string;
  emoji: string;
  category: string;
}

interface Gift {
  id: string;
  name: string;
  icon: string;
  animation?: string;
  price: number;
  type: string;
  category?: string;
  image?: string;
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

export default function AdminScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('emoji');
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const slideAnim = useRef(new Animated.Value(-screenWidth * 0.75)).current;

  // User search states
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Credit transfer states
  const [transferUsername, setTransferUsername] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPin, setTransferPin] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

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
  const [userStatusList, setUserStatusList] = useState([]);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);
  const [userCreditHistory, setUserCreditHistory] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);

  // Room management states
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [searchRoomText, setSearchRoomText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showEditRoomModal, setShowEditRoomModal] = useState(false);
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomDescription, setEditRoomDescription] = useState('');
  const [editRoomMaxMembers, setEditRoomMaxMembers] = useState(25);
  const [editRoomOwner, setEditRoomOwner] = useState('');
  const [editingRoom, setEditingRoom] = useState(false);

  // Ban management states
  const [bannedDevicesList, setBannedDevicesList] = useState([]);
  const [banLoading, setBanLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({
    brand: 'Unknown',
    modelName: 'Unknown Device',
    deviceType: 'Unknown'
  });

  // Form states for adding emoji/gift
  const [itemName, setItemName] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadedEmojiFile, setUploadedEmojiFile] = useState<any>(null);
  const [uploadedGiftImage, setUploadedGiftImage] = useState<any>(null);

  // Banner management states
  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerDescription, setBannerDescription] = useState('');
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerDisplayOrder, setBannerDisplayOrder] = useState('0');
  const [uploadedBannerImage, setUploadedBannerImage] = useState<any>(null);

  const menuItems: MenuItem[] = [
    {
      id: 'emoji',
      title: 'Kelola Emoji',
      icon: 'happy-outline',
      color: '#4CAF50',
      description: 'Tambah dan kelola emoji custom'
    },
    {
      id: 'gift',
      title: 'Kelola Gift',
      icon: 'gift-outline',
      color: '#FF6B35',
      description: 'Tambah dan kelola gift virtual'
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
      id: 'users',
      title: 'Kelola User',
      icon: 'people-outline',
      color: '#21963F',
      description: 'Cari dan promosikan user'
    },
    {
      id: 'credit',
      title: 'Transfer Credit',
      icon: 'diamond-outline',
      color: '#9C27B0',
      description: 'Transfer credit antar user'
    },
    {
      id: 'admin-credit',
      title: 'Tambah Credit',
      icon: 'add-circle-outline',
      color: '#FF9800',
      description: 'Tambah credit tanpa batasan'
    },
    {
      id: 'status',
      title: 'Status User',
      icon: 'analytics-outline',
      color: '#F44336',
      description: 'Monitor status dan aktivitas user'
    }
  ];

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
      loadEmojis();
      loadGifts();
      loadDeviceInfo();
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
    }
  }, [token, activeTab, user]);

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
    setActiveTab(itemId);
    toggleSideMenu();
  };

  const loadEmojis = async () => {
    try {
      console.log('Loading emojis with token:', token ? 'Present' : 'Missing');
      const response = await fetch(`${API_BASE_URL}/admin/emojis`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      console.log('Emojis response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Emojis loaded:', data.length);
        setEmojis(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load emojis:', response.status, errorData);
        Alert.alert('Error', `Failed to load emojis: ${response.status} ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading emojis:', error);
      Alert.alert('Error', 'Network error loading emojis');
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

  const handleFileUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*', 'application/json'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const handleEmojiFileUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload emoji files.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
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
        if (!['png', 'gif', 'jpg', 'jpeg'].includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG, GIF, JPG, or JPEG files only.');
          return;
        }

        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        if (fileSizeInBytes > 2 * 1024 * 1024) {
          Alert.alert('File too large', 'Please select an image smaller than 2MB.');
          return;
        }

        setUploadedEmojiFile({
          uri: asset.uri,
          base64: asset.base64,
          type: `image/${fileExtension}`,
          name: `emoji_${Date.now()}.${fileExtension}`,
          extension: fileExtension || 'png'
        });

        console.log('Emoji file selected:', {
          name: `emoji_${Date.now()}.${fileExtension}`,
          size: fileSizeInBytes,
          type: `image/${fileExtension}`
        });
      }
    } catch (error) {
      console.error('Error picking emoji file:', error);
      Alert.alert('Error', 'Failed to pick emoji file');
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
      Alert.alert('Error', error.message || 'Failed to add banner');
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
              Alert.alert('Error', error.message || 'Failed to delete banner');
            }
          }
        }
      ]
    );
  };

  const handleGiftImageUpload = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload gift files.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All, // Allow both images and videos
        allowsEditing: false, // Disable editing to prevent video processing errors
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
        videoMaxDuration: 30, // Allow up to 30 seconds for video gifts
        // Remove videoQuality to avoid undefined error
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        // Handle video files differently - they might not have base64
        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['png', 'gif', 'jpg', 'jpeg', 'mp4', 'webm', 'mov'];

        if (!allowedExtensions.includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG, GIF, JPG, JPEG, MP4, WebM, or MOV files only.');
          return;
        }

        const isVideo = ['mp4', 'webm', 'mov'].includes(fileExtension || '');

        // For videos, we might not have base64, so handle differently
        if (isVideo && !asset.base64) {
          // For video files without base64, we'll use the URI and handle server-side
          setUploadedGiftImage({
            uri: asset.uri,
            base64: null,
            type: `video/${fileExtension}`,
            name: `gift_${Date.now()}.${fileExtension}`,
            extension: fileExtension || 'mp4',
            isAnimated: true,
            duration: asset.duration || null,
            width: asset.width || 0,
            height: asset.height || 0
          });

          console.log('Video file selected (no base64):', {
            name: `gift_${Date.now()}.${fileExtension}`,
            type: `video/${fileExtension}`,
            duration: asset.duration,
            width: asset.width,
            height: asset.height
          });

          Alert.alert('Video Selected', 'Video file selected successfully. Note: Video files will be processed on upload.');
          return;
        }

        // For images and GIFs with base64
        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the file. Please try again.');
          return;
        }

        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        const maxSize = isVideo ? 15 * 1024 * 1024 : 5 * 1024 * 1024; // 15MB for videos, 5MB for images/GIFs

        if (fileSizeInBytes > maxSize) {
          Alert.alert('File too large', `Please select a file smaller than ${isVideo ? '15MB' : '5MB'}.`);
          return;
        }

        // Determine content type
        let contentType = `image/${fileExtension}`;
        if (isVideo) {
          contentType = `video/${fileExtension}`;
        }

        setUploadedGiftImage({
          uri: asset.uri,
          base64: asset.base64,
          type: contentType,
          name: `gift_${Date.now()}.${fileExtension}`,
          extension: fileExtension || 'png',
          isAnimated: fileExtension === 'gif' || isVideo,
          duration: asset.duration || null,
          width: asset.width || 0,
          height: asset.height || 0
        });

        console.log('Gift file selected:', {
          name: `gift_${Date.now()}.${fileExtension}`,
          size: fileSizeInBytes,
          type: contentType,
          isAnimated: fileExtension === 'gif' || isVideo,
          duration: asset.duration
        });
      }
    } catch (error) {
      console.error('Error picking gift file:', error);
      Alert.alert('Error', 'Failed to pick gift file: ' + error.message);
    }
  };

  const handleAddGift = async () => {
    if (!itemName.trim()) {
      Alert.alert('Error', 'Nama gift harus diisi');
      return;
    }
    if (!itemPrice.trim()) {
      Alert.alert('Error', 'Harga gift harus diisi');
      return;
    }

    if (!uploadedGiftImage) {
      Alert.alert('Error', 'File gift harus dipilih');
      return;
    }

    setLoading(true);
    try {
      const isVideo = uploadedGiftImage.type?.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(uploadedGiftImage.extension || '');

      const requestBody: any = {
        name: itemName.trim(),
        icon: '🎁',
        price: parseInt(itemPrice),
        type: isVideo || uploadedGiftImage.isAnimated ? 'animated' : 'static',
        category: 'popular'
      };

      // Handle video files (might not have base64)
      if (isVideo && !uploadedGiftImage.base64) {
        Alert.alert('Info', 'Video files are being processed. This may take a moment...');
        // In a real implementation, you'd handle file upload differently
        throw new Error('Video file processing not yet implemented. Please use GIF files for animated gifts.');
      }

      if (uploadedGiftImage && uploadedGiftImage.base64) {
        requestBody.giftImage = uploadedGiftImage.base64;
        requestBody.imageType = uploadedGiftImage.type;
        requestBody.imageName = uploadedGiftImage.name;

        if (isVideo) {
          requestBody.hasAnimation = true;
          requestBody.isAnimated = true;
          requestBody.duration = uploadedGiftImage.duration;
        }
      }

      if (selectedFile) {
        requestBody.hasAnimation = true;
      }

      console.log('Sending gift data:', {
        name: requestBody.name,
        type: requestBody.type,
        hasBase64: !!requestBody.giftImage,
        fileType: requestBody.imageType,
        isVideo: isVideo
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
      Alert.alert('Error', error.message || 'Gagal menambahkan gift');
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
      if (activeTab === 'emoji') {
        if (!uploadedEmojiFile && !itemIcon.trim()) {
          Alert.alert('Error', 'Please upload an emoji file or enter emoji character');
          return;
        }

        let requestBody;

        if (uploadedEmojiFile) {
          requestBody = {
            name: itemName.trim(),
            category: itemCategory?.trim() || 'general',
            emojiFile: uploadedEmojiFile.base64,
            emojiType: uploadedEmojiFile.extension,
            fileName: uploadedEmojiFile.name
          };
        } else if (itemIcon.trim()) {
          requestBody = {
            name: itemName.trim(),
            category: itemCategory?.trim() || 'general',
            emoji: itemIcon.trim()
          };
        } else {
          Alert.alert('Error', 'Please upload an emoji file or enter emoji character');
          return;
        }

        console.log('Sending emoji request:', {
          name: requestBody.name,
          category: requestBody.category,
          hasFile: !!requestBody.emojiFile,
          hasEmoji: !!requestBody.emoji
        });

        const response = await fetch(`${API_BASE_URL}/admin/emojis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'ChatMe-Mobile-App',
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          Alert.alert('Success', 'Emoji added successfully');
          loadEmojis();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add emoji');
        }
      } else {
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
      setUploadedEmojiFile(null);
      setUploadedGiftImage(null);
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding item:', error);
      Alert.alert('Error', error.message || 'Failed to add item');
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
              Alert.alert('Error', error.message || 'Failed to promote user');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
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
        const data = await response.json();
        // Enhance user data with device info for current user
        const enhancedUsers = data.users?.map(user => ({
          ...user,
          device: user.username === user?.username ? deviceName : user.device || 'Unknown Device',
          location: user.username === user?.username ? locationString : user.location || 'Unknown'
        })) || [];

        setUserStatusList(enhancedUsers);
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

  const loadUserCreditHistory = async (userId) => {
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

  const deleteRoom = async (roomId, roomName) => {
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
              Alert.alert('Error', error.message || 'Failed to delete room');
            } finally {
              setRoomsLoading(false);
            }
          }
        }
      ]
    );
  };

  const openEditRoomModal = (room) => {
    setSelectedRoom(room);
    setEditRoomName(room.name);
    setEditRoomDescription(room.description);
    setEditRoomMaxMembers(room.maxMembers || 25);
    setEditRoomOwner(room.managedBy || room.createdBy);
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
          managedBy: editRoomOwner.trim()
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
      Alert.alert('Error', error.message || 'Failed to update room');
    } finally {
      setEditingRoom(false);
    }
  };

  const handleBanDevice = async (userId, username, deviceId, userIp) => {
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

  const handleBanIP = async (userId, username, userIp) => {
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

  const executeBan = async (banType, userId, username, target, reason) => {
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
      Alert.alert('Error', error.message || `Failed to ban ${banType}. Please check your connection.`);
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnban = async (banId, banType, target) => {
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
              Alert.alert('Error', error.message || 'Failed to unban');
            } finally {
              setBanLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleTransferCredit = async () => {
    if (!transferUsername.trim()) {
      Alert.alert('Error', 'Username harus diisi');
      return;
    }

    if (!transferAmount.trim() || isNaN(Number(transferAmount)) || Number(transferAmount) <= 0) {
      Alert.alert('Error', 'Jumlah kredit harus berupa angka positif');
      return;
    }

    if (!transferPin.trim()) {
      Alert.alert('Error', 'PIN harus diisi');
      return;
    }

    setTransferLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/credits/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toUsername: transferUsername.trim(),
          amount: Number(transferAmount),
          pin: transferPin.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Berhasil', `Kredit berhasil dikirim ke ${transferUsername}!`);
        setTransferUsername('');
        setTransferAmount('');
        setTransferPin('000000');
      } else {
        Alert.alert('Error', data.error || 'Gagal mengirim kredit');
      }
    } catch (error) {
      console.error('Error transferring credits:', error);
      Alert.alert('Error', 'Gagal mengirim kredit. Silakan coba lagi.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleDeleteItem = async (id: string, type: 'emoji' | 'gift') => {
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
              const endpoint = type === 'emoji' ? 'emojis' : 'gifts';
              const response = await fetch(`${API_BASE_URL}/admin/${endpoint}/${id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Success', `${type} deleted successfully`);
                if (type === 'emoji') {
                  loadEmojis();
                } else {
                  loadGifts();
                }
              } else {
                throw new Error(`Failed to delete ${type}`);
              }
            } catch (error) {
              console.error(`Error deleting ${type}:`, error);
              Alert.alert('Error', `Failed to delete ${type}`);
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
      Alert.alert('Error', error.message || 'Gagal mengupdate gift');
    } finally {
      setLoading(false);
    }
  };

  const renderEmojiItem = ({ item }: { item: Emoji }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemEmoji}>{item.emoji}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteItem(item.id, 'emoji')}
        >
          <Ionicons name="trash-outline" size={16} color="#F44336" />
        </TouchableOpacity>
      </View>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.itemCategory}>{item.category}</Text>
    </View>
  );

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
      case 'emoji':
        return (
          <FlatList
            data={emojis}
            renderItem={renderEmojiItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="happy-outline" size={60} color="#ccc" />
                <Text style={styles.emptyTitle}>No Emojis Added</Text>
                <Text style={styles.emptySubtitle}>Add emojis to show in chat emoji picker</Text>
              </View>
            }
          />
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
                      {renderGiftGridItem({ item, index: 0 })}
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

      case 'users':
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
                      <Text style={styles.roomDetailLabel}>Created:</Text> {new Date(room.createdAt).toLocaleDateString()}
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
                      <Text style={styles.editFormLabel}>Maximum Capacity</Text>
                      <View style={styles.capacityEditContainer}>
                        {[25, 40, 80].map((capacity) => (
                          <TouchableOpacity
                            key={capacity}
                            style={[
                              styles.capacityEditOption,
                              editRoomMaxMembers === capacity && styles.capacityEditOptionSelected
                            ]}
                            onPress={() => setEditRoomMaxMembers(capacity)}
                          >
                            <Text style={[
                              styles.capacityEditOptionText,
                              editRoomMaxMembers === capacity && styles.capacityEditOptionTextSelected
                            ]}>
                              {capacity}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
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
              <View key={user.id} style={styles.userStatusCard}>
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
                            onPress: () => handleBanDevice(user.id, user.username, user.device, user.ip)
                          },
                          {
                            text: 'Ban IP',
                            onPress: () => handleBanIP(user.id, user.username, user.ip)
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
                        {new Date(transaction.createdAt).toLocaleString()}
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
                <View key={userItem.id} style={styles.deviceInfoCard}>
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
                      onPress={() => handleBanDevice(userItem.id, userItem.username, userItem.device || `${userItem.username}_device`, userItem.ip)}
                      disabled={banLoading}
                    >
                      <Ionicons name="phone-portrait" size={16} color="#fff" />
                      <Text style={styles.banActionText}>Ban Device</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.banActionButton, styles.banIpButton]}
                      onPress={() => handleBanIP(userItem.id, userItem.username, userItem.ip || 'unknown_ip')}
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
                      {new Date(banned.bannedAt).toLocaleDateString()}
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

      default:
        return (
          <ScrollView style={styles.creditTransferContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.creditTransferCard}>
              <Text style={styles.creditTransferTitle}>Transfer Credit</Text>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Username Penerima</Text>
                <TextInput
                  style={styles.creditInput}
                  value={transferUsername}
                  onChangeText={setTransferUsername}
                  placeholder="Masukkan username penerima..."
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>Jumlah Credit</Text>
                <TextInput
                  style={styles.creditInput}
                  value={transferAmount}
                  onChangeText={setTransferAmount}
                  placeholder="Masukkan jumlah credit..."
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.creditInputGroup}>
                <Text style={styles.creditInputLabel}>PIN</Text>
                <TextInput
                  style={styles.creditInput}
                  value={transferPin}
                  onChangeText={setTransferPin}
                  placeholder="000000"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  maxLength={6}
                  secureTextEntry
                />
              </View>

              <View style={styles.transferButtonContainer}>
                <TouchableOpacity
                  style={styles.transferButton}
                  onPress={handleTransferCredit}
                  disabled={transferLoading}
                >
                  {transferLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={20} color="#fff" />
                      <Text style={styles.transferButtonText}>Transfer Credit</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        );
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
                Add {activeTab === 'emoji' ? 'Emoji' : 'Gift'}
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

              {activeTab === 'emoji' ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Upload Emoji File</Text>
                    <Text style={styles.inputSubLabel}>Supports PNG, GIF files</Text>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={handleEmojiFileUpload}
                    >
                      <Ionicons name="cloud-upload" size={24} color="#FF6B35" />
                      <Text style={styles.uploadButtonText}>
                        {uploadedEmojiFile ? uploadedEmojiFile.name : 'UPLOAD EMOJI FILE'}
                      </Text>
                    </TouchableOpacity>
                    {uploadedEmojiFile && (
                      <View style={styles.previewContainer}>
                        <Image source={{ uri: uploadedEmojiFile.uri }} style={styles.emojiPreview} />
                        <TouchableOpacity
                          style={styles.removeFileButton}
                          onPress={() => setUploadedEmojiFile(null)}
                        >
                          <Ionicons name="close-circle" size={20} color="#F44336" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.divider} />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Emoji Character (Text)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={itemIcon}
                      onChangeText={setItemIcon}
                      placeholder="😀"
                      editable={!uploadedEmojiFile}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Category</Text>
                    <TextInput
                      style={styles.textInput}
                      value={itemCategory}
                      onChangeText={setItemCategory}
                      placeholder="general, smileys, animals, etc."
                    />
                  </View>
                </>
              ) : (
                <>
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
                </>
              )}
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
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    maxHeight: '80%',
    minWidth: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
  emojiPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
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
  userActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
  giftGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
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
  emptyGiftList: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyGiftText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
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
});