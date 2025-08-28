import React, { useState, useEffect } from 'react';
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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

// Use same API URL logic as other screens
const getApiUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const currentHost = window.location.host;
    const protocol = window.location.protocol;
    if (currentHost && currentHost.includes('replit.dev')) {
      return `${protocol}//${currentHost.replace(':3000', ':5000')}`;
    }
    return 'https://5025390a-a7db-400e-8718-826d40b22e68-00-pt6tblb4r8su.pike.replit.dev:5000';
  }
  return 'https://5025390a-a7db-400e-8718-826d40b22e68-00-pt6tblb4r8su.pike.replit.dev';
};

const API_BASE_URL = getApiUrl();

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

export default function AdminScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('emoji');
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // User search states
  const [searchUsername, setSearchUsername] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Form states for adding emoji/gift
  const [itemName, setItemName] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploadedEmojiFile, setUploadedEmojiFile] = useState<any>(null);
  const [uploadedGiftImage, setUploadedGiftImage] = useState<any>(null);

  useEffect(() => {
    if (token) {
      loadEmojis();
      loadGifts();
    }
  }, [token]);

  const loadEmojis = async () => {
    try {
      console.log('Loading emojis with token:', token ? 'Present' : 'Missing');
      const response = await fetch(`${API_BASE_URL}/api/admin/emojis`, {
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
      const response = await fetch(`${API_BASE_URL}/api/admin/gifts`, {
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
        type: ['image/*', 'application/json'],
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
      // Request permission first
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

        // Validate base64 data
        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the image. Please try again.');
          return;
        }

        // Check file type
        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        if (!['png', 'gif', 'jpg', 'jpeg'].includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG, GIF, JPG, or JPEG files only.');
          return;
        }

        // Check file size (limit to 2MB)
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

  const handleGiftImageUpload = async () => {
    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need camera roll permissions to upload gift images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
        videoMaxDuration: 10, // Limit WebM videos to 10 seconds
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        // Validate base64 data
        if (!asset.base64) {
          Alert.alert('Error', 'Failed to process the image. Please try again.');
          return;
        }

        // Check file type
        const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
        if (!['png', 'gif', 'jpg', 'jpeg', 'webm'].includes(fileExtension || '')) {
          Alert.alert('Invalid file type', 'Please select PNG, GIF, JPG, JPEG, or WebM files only.');
          return;
        }

        // Check file size (limit to 2MB for images, and 10MB for videos for example)
        // For simplicity, we'll use a general limit here, adjust as needed.
        const fileSizeInBytes = (asset.base64.length * 3) / 4;
        const maxSize = fileExtension === 'webm' ? 10 * 1024 * 1024 : 2 * 1024 * 1024; // 10MB for webm, 2MB for images

        if (fileSizeInBytes > maxSize) {
          Alert.alert('File too large', `Please select a file smaller than ${fileExtension === 'webm' ? '10MB' : '2MB'}.`);
          return;
        }


        setUploadedGiftImage({
          uri: asset.uri,
          base64: asset.base64,
          type: fileExtension === 'webm' ? 'video/webm' : `image/${fileExtension}`,
          name: `gift_${Date.now()}.${fileExtension}`,
          extension: fileExtension || 'png'
        });

        console.log('Gift file selected:', {
          name: `gift_${Date.now()}.${fileExtension}`,
          size: fileSizeInBytes,
          type: fileExtension === 'webm' ? 'video/webm' : `image/${fileExtension}`
        });
      }
    } catch (error) {
      console.error('Error picking gift image:', error);
      Alert.alert('Error', 'Failed to pick gift image');
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
        // For emoji, we can either use uploaded file or text emoji
        if (!uploadedEmojiFile && !itemIcon.trim()) {
          Alert.alert('Error', 'Please upload an emoji file or enter emoji character');
          return;
        }

        let requestBody;

        if (uploadedEmojiFile) {
          // Use uploaded file
          requestBody = {
            name: itemName.trim(),
            category: itemCategory?.trim() || 'general',
            emojiFile: uploadedEmojiFile.base64,
            emojiType: uploadedEmojiFile.extension,
            fileName: uploadedEmojiFile.name
          };
        } else if (itemIcon.trim()) {
          // Use text emoji
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

        const response = await fetch(`${API_BASE_URL}/api/admin/emojis`, {
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
        // For gifts
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

        // Add gift image if uploaded
        if (uploadedGiftImage) {
          requestBody.giftImage = uploadedGiftImage.base64;
          requestBody.imageType = uploadedGiftImage.type; // Use the determined type
          requestBody.imageName = uploadedGiftImage.name;
        }

        // Add animation file if uploaded
        if (selectedFile) {
          // Handle animation file separately if needed
          requestBody.hasAnimation = true;
        }

        console.log('Sending gift request:', {
          name: requestBody.name,
          category: requestBody.category,
          hasImage: !!requestBody.giftImage,
          hasAnimation: requestBody.hasAnimation
        });

        const response = await fetch(`${API_BASE_URL}/api/admin/gifts`, {
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

      // Reset form
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
      const response = await fetch(`${API_BASE_URL}/api/admin/users/search?username=${encodeURIComponent(searchUsername.trim())}`, {
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
              const response = await fetch(`${API_BASE_URL}/api/admin/users/promote`, {
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
                // Refresh search results
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
              const response = await fetch(`${API_BASE_URL}/api/admin/${endpoint}/${id}`, {
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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'emoji' && styles.activeTab]}
          onPress={() => setActiveTab('emoji')}
        >
          <Ionicons name="happy-outline" size={20} color={activeTab === 'emoji' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'emoji' && styles.activeTabText]}>
            Emoji ({emojis.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'gift' && styles.activeTab]}
          onPress={() => setActiveTab('gift')}
        >
          <Ionicons name="gift-outline" size={20} color={activeTab === 'gift' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'gift' && styles.activeTabText]}>
            Gifts ({gifts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'users' && styles.activeTab]}
          onPress={() => setActiveTab('users')}
        >
          <Ionicons name="people-outline" size={20} color={activeTab === 'users' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'emoji' ? (
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
        ) : activeTab === 'gift' ? (
          <FlatList
            data={gifts}
            renderItem={renderGiftItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="gift-outline" size={60} color="#ccc" />
                <Text style={styles.emptyTitle}>No Gifts Added</Text>
                <Text style={styles.emptySubtitle}>Add gifts for users to send in chat</Text>
              </View>
            }
          />
        ) : (
          <View style={styles.userSearchContainer}>
            {/* Search Input */}
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

            {/* Search Results */}
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
        )}
      </View>

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

            <ScrollView style={styles.modalContent}>
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
  addButton: {
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  activeTab: {
    backgroundColor: '#FF6B35',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6,
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
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
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFF8F0',
    borderStyle: 'dashed',
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
});