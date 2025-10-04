import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Image,
  Alert,
  RefreshControl,
  Modal,
  Platform,
  Dimensions,
  Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';

// Import Video with error handling
let Video: any = null;
let VideoView: any = null;
try {
  const ExpoVideo = require('expo-av');
  Video = ExpoVideo.Video;
  VideoView = ExpoVideo.Video;
  console.log('expo-av video loaded successfully');
} catch (error) {
  try {
    Video = require('expo-video').default;
    VideoView = require('expo-video').VideoView;
    console.log('expo-video loaded successfully');
  } catch (videoError) {
    console.warn('Neither expo-av nor expo-video available:', error, videoError);
  }
}

interface Comment {
  id: string;
  user: string;
  content: string;
  timestamp: string;
}

interface MediaFile {
  id: string;
  type: 'photo' | 'video';
  url: string;
  filename: string;
}

interface FeedPost {
  id: string;
  user: string;
  username: string;
  content: string;
  timestamp: string;
  likes: number;
  comments: Comment[];
  shares: number;
  level: number;
  avatar?: string;
  mediaFiles?: MediaFile[];
  role?: string;
  verified?: boolean;
  streamingUrl?: string;
}

interface MediaItem {
  type: 'photo' | 'video';
  uri: string;
  base64: string | null;
  filename: string;
  size?: number;
}

export default function FeedScreen() {
  const { height } = Dimensions.get('window');
  const [postText, setPostText] = useState('');
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState<FeedPost | null>(null);
  
  const videoRef = useRef<Video>(null);

  const { user } = useAuth();
  const navigation = useNavigation();

  // Helper function to get role color
  const getRoleColor = (role?: string) => {
    switch (role) {
      case 'admin': return '#FF6B35'; // Orange Red
      case 'mentor': return '#FF5722'; // Deep Orange
      case 'merchant': return '#9C27B0'; // Purple
      case 'user': 
      default: return '#2196F3'; // Blue
    }
  };

  // Helper function to get role background color
  const getRoleBackgroundColor = (role?: string) => {
    switch (role) {
      case 'admin': return '#FFEBEE'; // Light red
      case 'mentor': return '#FBE9E7'; // Light orange
      case 'merchant': return '#F3E5F5'; // Light purple
      case 'user':
      default: return '#E3F2FD'; // Light blue
    }
  };

  // Helper function to get role badge text
  const getRoleBadgeText = (role?: string) => {
    switch (role) {
      case 'admin': return 'ADMIN';
      case 'mentor': return 'MENTOR';
      case 'merchant': return 'MERCHANT';
      case 'user':
      default: return 'USER';
    }
  };

  // Helper function to get level badge color (gradient green to blue)
  const getLevelBadgeColor = (level: number) => {
    if (level >= 10) {
      return { bg: '#E3F2FD', text: '#2196F3', icon: '#2196F3' }; // Full blue at level 10+
    }
    // Gradient from green to blue (levels 1-9)
    const ratio = (level - 1) / 9; // 0 at level 1, 1 at level 9
    const greenValue = Math.round(107 - ratio * 74); // 107 (green) to 33 (blue)
    const blueValue = Math.round(142 + ratio * 101); // 142 (green) to 243 (blue)
    
    const textColor = `rgb(${greenValue}, ${blueValue}, 107)`;
    const bgColor = level <= 3 ? '#F0FFF4' : level <= 6 ? '#E8F5E9' : '#E1F5FE';
    
    return { bg: bgColor, text: textColor, icon: textColor };
  };


  // Helper function to check if URL is a YouTube URL
  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  // Helper function to extract YouTube video ID
  const getYouTubeVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Helper function to get YouTube thumbnail
  const getYouTubeThumbnail = (videoId: string) => {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  // Fetch posts from server
  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/feed/posts`);

      if (response.ok) {
        const postsData = await response.json();
        // Process posts to include proper avatar URLs
        const processedPosts = postsData.map((post: FeedPost) => ({
          ...post,
          avatar: post.avatar && post.avatar.startsWith('/api/') 
            ? `${BASE_URL}${post.avatar}` 
            : post.avatar
        }));
        setFeedPosts(processedPosts);
      } else {
        throw new Error('Failed to fetch posts');
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      Alert.alert('Error', 'Failed to load posts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Pick image from gallery
  const pickImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedMedia(prev => [...prev, {
          type: 'photo',
          uri: asset.uri,
          base64: asset.base64,
          filename: `photo_${Date.now()}.jpg`
        }]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  // Pick video from gallery
  const pickVideo = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.3, // Lower quality for faster upload
        allowsMultipleSelection: false,
        base64: false, // Don't load base64 for videos initially
      });

      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0]) {
        const asset = result.assets[0];

        // For videos, we'll convert to base64 but with size limits
        try {
          const response = await fetch(asset.uri);
          const blob = await response.blob();

          // Check file size (limit to 10MB for videos)
          if (blob.size > 10 * 1024 * 1024) {
            Alert.alert('File Too Large', 'Video must be smaller than 10MB. Please select a smaller video or reduce quality.');
            return;
          }

          // Convert to base64
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = reader.result as string;
            if (!base64Data || typeof base64Data !== 'string') {
              Alert.alert('Error', 'Failed to process video file. Please try again.');
              return;
            }

            const base64WithoutPrefix = base64Data.split(',')[1];
            if (!base64WithoutPrefix || base64WithoutPrefix.length < 100) {
              Alert.alert('Error', 'Video file appears to be corrupted. Please try a different video.');
              return;
            }

            setSelectedMedia(prev => [...prev, {
              type: 'video',
              uri: asset.uri,
              base64: base64WithoutPrefix,
              filename: asset.fileName || `video_${Date.now()}.mp4`
            }]);
          };

          reader.onerror = () => {
            Alert.alert('Error', 'Failed to read video file. Please try again.');
          };

          reader.readAsDataURL(blob);
        } catch (conversionError) {
          console.error('Error converting video to base64:', conversionError);
          Alert.alert('Error', 'Failed to process video. Please try again.');
        }

        console.log('Video selected:', asset.fileName, 'Duration:', asset.duration);
      }
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to pick video');
    }
  };

  // Upload media files
  const uploadMedia = async (mediaFiles: MediaItem[]) => {
    const uploadedFiles: MediaFile[] = [];

    for (const media of mediaFiles) {
      try {
        const result = await uploadToServer(media);
        const uploadedFile: MediaFile = {
          id: result.fileId,
          type: result.type,
          url: result.url,
          filename: result.filename
        };
        uploadedFiles.push(uploadedFile);
        console.log('Added uploaded file:', uploadedFile);
      } catch (error) {
        console.error(`Failed to upload ${media.filename}:`, error);
        Alert.alert('Upload Error', `Could not upload ${media.filename}. Please try again.`);
        // Optionally, decide if you want to stop the entire upload process or continue with other files
        // For now, we'll stop and report the error.
        throw error; 
      }
    }
    console.log('All uploaded files:', uploadedFiles);
    return uploadedFiles;
  };

  // Upload file to the server with improved error handling
  const uploadToServer = async (mediaItem: MediaItem) => {
      try {
        console.log('Uploading to server:', mediaItem.filename, 'Type:', mediaItem.type);

        // Validate required fields before sending
        if (!mediaItem.type || !mediaItem.base64 || !mediaItem.filename) {
          throw new Error('Missing required media data. Please try selecting the file again.');
        }

        if (!user?.username) {
          throw new Error('User not logged in. Please log in and try again.');
        }

        // Check for placeholder data
        if (mediaItem.base64 === 'video_placeholder' || mediaItem.base64 === 'photo_placeholder') {
          throw new Error('File processing incomplete. Please wait for the file to be processed and try again.');
        }

        const uploadData = {
          type: mediaItem.type,
          data: mediaItem.base64,
          filename: mediaItem.filename,
          user: user.username
        };

        console.log('Upload request data:', {
          type: uploadData.type,
          filename: uploadData.filename,
          user: uploadData.user,
          dataLength: uploadData.data?.length || 0,
          dataPreview: uploadData.data?.substring(0, 50) || 'N/A'
        });

        const response = await fetch(`${API_BASE_URL}/feed/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ChatMe-Mobile-App',
          },
          body: JSON.stringify(uploadData),
        });

        console.log('Upload response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `Upload failed with status ${response.status}` 
          }));
          console.error('Upload error response:', errorData);
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const result = await response.json();
        console.log('Upload successful:', result);
        return result;
      } catch (error) {
        console.error('Upload error:', error);
        throw error;
      }
    };

  // Remove selected media
  const removeMedia = (index: number) => {
    setSelectedMedia(prev => prev.filter((_, i) => i !== index));
  };

  // Create new post
  const handleSend = async () => {
    if (postText.trim() || selectedMedia.length > 0) {
      try {
        setUploading(true);

        let uploadedFiles: MediaFile[] = [];
        if (selectedMedia.length > 0) {
          uploadedFiles = await uploadMedia(selectedMedia);
        }

        const endpoint = uploadedFiles.length > 0 ? 
          `${API_BASE_URL}/feed/posts/with-media` : 
          `${API_BASE_URL}/feed/posts`;

        console.log('Creating post with endpoint:', endpoint);
        console.log('Post data:', {
          content: postText,
          user: user?.username || 'Anonymous',
          username: user?.username || 'Anonymous',
          level: 1,
          avatar: user?.username?.charAt(0).toUpperCase() || 'A',
          mediaFiles: uploadedFiles
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ChatMe-Mobile-App',
          },
          body: JSON.stringify({
            content: postText,
            user: user?.username || 'Anonymous',
            username: user?.username || 'Anonymous',
            level: 1,
            avatar: user?.username?.charAt(0).toUpperCase() || 'A',
            mediaFiles: uploadedFiles,
            streamingUrl: user?.role === 'admin' ? videoUrl.trim() : ''
          }),
        });

        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response body:', responseText);

        if (response.ok) {
          const newPost = JSON.parse(responseText);
          setFeedPosts(prev => [newPost, ...prev]);
          setPostText('');
          setSelectedMedia([]);
          setVideoUrl('');
          Alert.alert('Success', 'Post created successfully!');
        } else {
          let errorMessage = 'Failed to create post';
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = `Server error: ${response.status}`;
          }
          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error('Error creating post:', error);
        Alert.alert('Error', `Failed to create post: ${error.message}`);
      } finally {
        setUploading(false);
      }
    }
  };

  // Handle like/unlike
  const handleLike = async (postId: string) => {
    try {
      const isLiked = likedPosts.has(postId);
      const action = isLiked ? 'unlike' : 'like';

      const response = await fetch(`${API_BASE_URL}/feed/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update local state
        setFeedPosts(prev => prev.map(post => 
          post.id === postId ? { ...post, likes: result.likes } : post
        ));

        // Update liked posts set
        setLikedPosts(prev => {
          const newSet = new Set(prev);
          if (action === 'like') {
            newSet.add(postId);
          } else {
            newSet.delete(postId);
          }
          return newSet;
        });
      } else {
        throw new Error('Failed to update like');
      }
    } catch (error) {
      console.error('Error updating like:', error);
      Alert.alert('Error', 'Failed to update like');
    }
  };

  // Handle share - show share menu
  const handleShare = async (post: FeedPost) => {
    setSelectedPostForShare(post);
    setShowShareMenu(true);
  };

  // Share to specific platform
  const shareToSocialMedia = async (platform: string) => {
    if (!selectedPostForShare) return;

    const shareMessage = `${selectedPostForShare.content}\n\n- Shared from ChatMe\n@${selectedPostForShare.username}`;

    try {
      setShowShareMenu(false);
      let shareSuccessful = false;

      // Get platform-specific title
      let shareTitle = 'Share Post';
      switch (platform) {
        case 'whatsapp':
          shareTitle = 'Share to WhatsApp';
          break;
        case 'facebook':
          shareTitle = 'Share to Facebook';
          break;
        case 'instagram':
          shareTitle = 'Share to Instagram';
          break;
        case 'tiktok':
          shareTitle = 'Share to TikTok';
          break;
        default:
          shareTitle = 'Share Post';
      }

      // Use native share sheet for all platforms (most reliable way to detect successful share)
      try {
        const result = await Share.share(
          {
            message: shareMessage,
          },
          {
            dialogTitle: shareTitle,
            subject: shareTitle,
          }
        );
        
        // Only mark as successful if user actually shared (not dismissed/cancelled)
        if (result.action === Share.sharedAction) {
          shareSuccessful = true;
        }
      } catch (error) {
        console.error(`Error sharing to ${platform}:`, error);
        Alert.alert('Share Error', 'Failed to open share menu. Please try again.');
      }

      // Only update share count if sharing was successful
      if (shareSuccessful) {
        const response = await fetch(`${API_BASE_URL}/feed/posts/${selectedPostForShare.id}/share`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const result = await response.json();
          setFeedPosts(prev => prev.map(post => 
            post.id === selectedPostForShare.id ? { ...post, shares: result.shares } : post
          ));
        }
      }
    } catch (error) {
      console.error('Error sharing to social media:', error);
      Alert.alert('Error', 'Failed to share post');
    }
  };

  // Handle delete post
  const handleDeletePost = async (postId: string, postUsername: string) => {
    // Check if user can delete this post
    if (postUsername !== user?.username && user?.role !== 'admin') {
      Alert.alert('Error', 'You can only delete your own posts');
      return;
    }

    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/feed/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  username: user?.username,
                  role: user?.role
                }),
              });

              if (response.ok) {
                // Remove post from local state
                setFeedPosts(prev => prev.filter(post => post.id !== postId));
                setShowPostMenu(null);
                Alert.alert('Success', 'Post deleted successfully');
              } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete post');
              }
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', `Failed to delete post: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  // Handle comment
  const handleComment = (post: FeedPost) => {
    setSelectedPost(post);
    setShowCommentModal(true);
  };

  // Add comment
  const handleAddComment = async () => {
    if (commentText.trim() && selectedPost) {
      try {
        const response = await fetch(`${API_BASE_URL}/feed/posts/${selectedPost.id}/comment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: commentText,
            user: user?.username || 'Anonymous',
          }),
        });

        if (response.ok) {
          const result = await response.json();

          // Update local state
          setFeedPosts(prev => prev.map(post => 
            post.id === selectedPost.id 
              ? { ...post, comments: [...post.comments, result.comment] }
              : post
          ));

          setCommentText('');
          setShowCommentModal(false);
          Alert.alert('Success', 'Comment added successfully!');
        } else {
          throw new Error('Failed to add comment');
        }
      } catch (error) {
        console.error('Error adding comment:', error);
        Alert.alert('Error', 'Failed to add comment');
      }
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // Handle user profile click
  const handleUserClick = async (post: FeedPost) => {
    try {
      // First, try to get the user ID from the database
      const response = await fetch(`${API_BASE_URL}/users/search?query=${post.username}`);
      if (response.ok) {
        const users = await response.json();
        const foundUser = users.find((u: any) => u.username === post.username);

        if (foundUser) {
          navigation.navigate('Profile', { userId: foundUser.id });
        } else {
          // If user not found in search, use username as ID for mock data
          navigation.navigate('Profile', { userId: post.username === 'bob_al' ? '1' : post.user || post.username,
            username: post.username 
          });
        }
      } else {
        // Fallback navigation
        navigation.navigate('Profile', { 
          userId: post.username === 'bob_al' ? '1' : post.user || post.username,
          username: post.username 
        });
      }
    } catch (error) {
      console.error('Error navigating to profile:', error);
      // Still navigate even if there's an error
      navigation.navigate('Profile', { 
        userId: post.username === 'bob_al' ? '1' : post.user || post.username,
        username: post.username 
      });
    }
  };

  // Refresh posts
  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const renderPost = (post: FeedPost) => {
    // Safety check for post object
    if (!post || !post.id) {
      console.warn('Invalid post object:', post);
      return null;
    }

    return (
      <View key={post.id} style={[styles.postCard, { backgroundColor: getRoleBackgroundColor(post.role) }]}>
        <View style={styles.postHeader}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => handleUserClick(post)}
          >
            <View style={[styles.avatar, { borderColor: getRoleColor(post.role), borderWidth: 2 }]}>
              {post.avatar && (post.avatar.startsWith('http') || post.avatar.startsWith('/api/')) ? (
                <Image 
                  source={{ uri: post.avatar }} 
                  style={styles.avatarImage}
                  onError={(error) => {
                    console.log('Avatar failed to load:', post.avatar, error.nativeEvent);
                  }}
                  onLoad={() => {
                    console.log('Avatar loaded successfully:', post.avatar);
                  }}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {(post.avatar && post.avatar.length <= 2) ? post.avatar : (post.username?.charAt(0)?.toUpperCase() || 'U')}
                </Text>
              )}
            </View>
            <View style={styles.onlineIndicator} />
          </TouchableOpacity>
        <View style={styles.postInfo}>
          <View style={styles.postInfoHeader}>
            <TouchableOpacity onPress={() => handleUserClick(post)} style={{ flex: 1 }}>
              <View style={styles.userInfo}>
                <Text style={[styles.username, { color: getRoleColor(post.role) }]}>
                  {post.username}
                </Text>
                {post.verified && (
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" style={{ marginLeft: 4 }} />
                )}
                <View style={[styles.roleBadge, { backgroundColor: getRoleColor(post.role) }]}>
                  <Text style={styles.roleText}>{getRoleBadgeText(post.role)}</Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: getLevelBadgeColor(post.level).bg }]}>
                  <Ionicons name="heart" size={12} color={getLevelBadgeColor(post.level).icon} />
                  <Text style={[styles.levelText, { color: getLevelBadgeColor(post.level).text }]}>Lv.{post.level}</Text>
                </View>
              </View>
            </TouchableOpacity>
            
            {/* Three-dot menu - show only for own posts or admin */}
            {(post.username === user?.username || user?.role === 'admin') && (
              <TouchableOpacity
                style={styles.postMenuButton}
                onPress={() => setShowPostMenu(showPostMenu === post.id ? null : post.id)}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          {/* Post Menu Dropdown */}
          {showPostMenu === post.id && (
            <View style={styles.postMenuDropdown}>
              <TouchableOpacity
                style={styles.postMenuItem}
                onPress={() => handleDeletePost(post.id, post.username)}
              >
                <Ionicons name="trash-outline" size={16} color="#F44336" />
                <Text style={[styles.postMenuText, { color: '#F44336' }]}>Delete Post</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.postContent}>{post.content}</Text>
          
          {/* Video URL Display */}
          {post.streamingUrl && post.streamingUrl.trim() && (
            <View style={styles.videoUrlContainer}>
              {isYouTubeUrl(post.streamingUrl) ? (
                // YouTube URL handling
                <TouchableOpacity 
                  style={styles.youtubeVideoContainer}
                  onPress={() => {
                    const videoId = getYouTubeVideoId(post.streamingUrl);
                    if (videoId) {
                      Alert.alert(
                        'Open YouTube Video',
                        'This will open the video in your default browser or YouTube app.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { 
                            text: 'Open YouTube', 
                            onPress: () => {
                              console.log('Opening YouTube URL:', post.streamingUrl);
                              // In a real app, you would use Linking.openURL(post.streamingUrl)
                            }
                          }
                        ]
                      );
                    }
                  }}
                >
                  {getYouTubeVideoId(post.streamingUrl) && (
                    <Image
                      source={{ uri: getYouTubeThumbnail(getYouTubeVideoId(post.streamingUrl)) }}
                      style={styles.youtubeThumbnail}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.youtubeOverlay}>
                    <View style={styles.youtubePlayButton}>
                      <Ionicons name="logo-youtube" size={40} color="#FF0000" />
                    </View>
                    <Text style={styles.youtubeText}>YouTube Video</Text>
                  </View>
                </TouchableOpacity>
              ) : (Video || VideoView) ? (
                // Regular video URL handling
                <TouchableOpacity 
                  style={styles.inlineVideoContainer}
                  onPress={() => {
                    console.log('Opening video URL:', post.streamingUrl);
                    setSelectedVideoUrl(post.streamingUrl);
                    setShowVideoModal(true);
                  }}
                >
                  {Video ? (
                    <Video
                      style={styles.inlineVideo}
                      source={{ uri: post.streamingUrl }}
                      useNativeControls={false}
                      resizeMode="cover"
                      shouldPlay={false}
                      isLooping={false}
                      volume={0}
                      onError={(error) => {
                        console.log('Inline video preview error:', error);
                      }}
                    />
                  ) : (
                    <VideoView
                      style={styles.inlineVideo}
                      source={{ uri: post.streamingUrl }}
                      useNativeControls={false}
                      resizeMode="cover"
                      shouldPlay={false}
                      volume={0}
                    />
                  )}
                  <View style={styles.videoOverlay}>
                    <Ionicons name="play-circle" size={50} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.videoPlayText}>Tap to play video</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                // Fallback for no video player
                <TouchableOpacity 
                  style={styles.videoLinkContainer}
                  onPress={() => {
                    Alert.alert(
                      'Open Video URL',
                      `Do you want to open this video URL?\n\n${post.streamingUrl}`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Open', 
                          onPress: () => {
                            console.log('Opening video URL:', post.streamingUrl);
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Ionicons name="videocam" size={16} color="#FF6B35" />
                  <Text style={styles.videoLinkText}>📹 VIDEO URL</Text>
                  <Ionicons name="play-outline" size={14} color="#FF6B35" />
                </TouchableOpacity>
              )}
            </View>
          )}
          
          <Text style={styles.timestamp}>{formatTimestamp(post.timestamp)}</Text>
        </View>
      </View>

      {/* Media Files */}
        {post.mediaFiles && Array.isArray(post.mediaFiles) && post.mediaFiles.length > 0 && (
          <View style={styles.mediaContainer}>
            {post.mediaFiles.map((media, index) => {
              // Ensure media object exists and has required properties
              if (!media || !media.type || !media.url) {
                console.log('Invalid media object:', media);
                return null;
              }

              // Construct full URL if needed
              const fullMediaUrl = media.url.startsWith('http') 
                ? media.url 
                : `${BASE_URL}${media.url}`;

              return (
                <View key={media.id || `media-${index}`} style={styles.mediaItem}>
                  {media.type === 'photo' ? (
                    <Image
                      source={{ uri: fullMediaUrl }}
                      style={styles.postImage}
                      resizeMode="cover"
                      onLoad={() => console.log('Image loaded successfully:', fullMediaUrl)}
                      onError={(error) => {
                        console.log('Image failed to load:', fullMediaUrl, error.nativeEvent);
                      }}
                    />
                  ) : media.type === 'video' ? (
                    <TouchableOpacity style={styles.videoContainer} onPress={() => {
                      // Check if video URL is valid
                      if (media.url && media.url !== '/api/feed/media/undefined' && !media.url.includes('undefined')) {
                        console.log('Opening video:', fullMediaUrl);
                        setSelectedVideoUrl(fullMediaUrl);
                        setShowVideoModal(true);
                      } else {
                        console.log('Invalid video URL:', media.url);
                        Alert.alert('Error', 'Video file not found or corrupted');
                      }
                    }}>
                      <View style={styles.videoThumbnail}>
                        <Ionicons name="play-circle" size={50} color="#fff" />
                        <Text style={styles.videoPlayText}>Tap to play</Text>
                      </View>
                      <View style={styles.videoInfo}>
                        <Text style={styles.videoTitle}>Video</Text>
                        <Text style={styles.videoFilename}>{media.filename || 'Video file'}</Text>
                        <Text style={styles.videoStatus}>
                          {media.url && media.url !== '/api/feed/media/undefined' ? 'Ready' : 'Processing...'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

      <View style={styles.postActions}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleLike(post.id)}
        >
          <Ionicons 
            name={likedPosts.has(post.id) ? "heart" : "heart-outline"} 
            size={20} 
            color={likedPosts.has(post.id) ? "#FF6B6B" : "#666"} 
          />
          <Text style={[
            styles.actionText,
            likedPosts.has(post.id) && { color: "#FF6B6B" }
          ]}>
            {post.likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleComment(post)}
        >
          <Ionicons name="chatbubble-outline" size={20} color="#666" />
          <Text style={styles.actionText}>{post.comments.length} Comments</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => handleShare(post)}
        >
          <Ionicons name="share-outline" size={20} color="#666" />
          <Text style={styles.actionText}>{post.shares} Share</Text>
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moment</Text>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onScrollBeginDrag={() => setShowPostMenu(null)}
      >
        {/* Post Creation Card */}
        <View style={styles.createPostCard}>
          <View style={styles.createPostHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.onlineIndicator} />
            </View>
            <TextInput
              style={styles.postInput}
              placeholder="What's on your mind..."
              value={postText}
              onChangeText={setPostText}
              multiline
            />
            <TouchableOpacity 
              onPress={handleSend}
              disabled={(!postText.trim() && selectedMedia.length === 0) || uploading}
            >
              <LinearGradient
                colors={
                  (!postText.trim() && selectedMedia.length === 0) || uploading 
                    ? ['#ccc', '#ccc'] 
                    : ['#FF6B6B', '#8B5CF6']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sendButton}
              >
                <Text style={styles.sendButtonText}>
                  {uploading ? 'Uploading...' : 'Send'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Selected Media Preview */}
          {selectedMedia.length > 0 && (
            <View style={styles.selectedMediaContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {selectedMedia.map((media, index) => (
                  <View key={index} style={styles.selectedMediaItem}>
                    {media.type === 'photo' ? (
                      <Image
                        source={{ uri: media.uri }}
                        style={styles.selectedMediaPreview}
                      />
                    ) : (
                      <View style={styles.selectedVideoPreview}>
                        <Ionicons name="videocam" size={40} color="#fff" />
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => removeMedia(index)}
                    >
                      <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Admin Video URL Input */}
          {user?.role === 'admin' && (
            <View style={styles.streamingUrlContainer}>
              <Ionicons name="videocam-outline" size={20} color="#FF6B35" />
              <TextInput
                style={styles.streamingUrlInput}
                placeholder="Add video URL (Admin only)..."
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholderTextColor="#999"
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          )}

          <View style={styles.mediaButtons}>
            <TouchableOpacity style={styles.mediaButton} onPress={pickImage}>
              <Ionicons name="image-outline" size={20} color="#4CAF50" />
              <Text style={styles.mediaButtonText}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mediaButton} onPress={pickVideo}>
              <Ionicons name="videocam-outline" size={20} color="#2196F3" />
              <Text style={styles.mediaButtonText}>Video</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Feed Posts */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading posts...</Text>
          </View>
        ) : (
          feedPosts.map(renderPost)
        )}
      </ScrollView>

      {/* Comment Modal */}
      <Modal
        visible={showCommentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCommentModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.commentsContainer}>
              {selectedPost?.comments.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <Text style={styles.commentUser}>{comment.user}</Text>
                  <Text style={styles.commentContent}>{comment.content}</Text>
                  <Text style={styles.commentTime}>{formatTimestamp(comment.timestamp)}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.addCommentContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity 
                style={[styles.commentSendButton, !commentText.trim() && styles.sendButtonDisabled]}
                onPress={handleAddComment}
                disabled={!commentText.trim()}
              >
                <Ionicons name="send" size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        visible={showVideoModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowVideoModal(false);
          setSelectedVideoUrl(null);
          if (videoRef.current) {
            videoRef.current.stopAsync();
          }
        }}
      >
        <View style={styles.videoModalContainer}>
          <View style={styles.videoModalContent}>
            <View style={styles.videoModalHeader}>
              <Text style={styles.modalTitle}>Video Player</Text>
              <TouchableOpacity onPress={() => {
                setShowVideoModal(false);
                setSelectedVideoUrl(null);
                if (videoRef.current) {
                  videoRef.current.stopAsync();
                }
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedVideoUrl && (Video || VideoView) ? (
              Video ? (
                <Video
                  ref={videoRef}
                  style={styles.videoPlayer}
                  source={{ 
                    uri: selectedVideoUrl.startsWith('http') ? selectedVideoUrl : `${BASE_URL}${selectedVideoUrl}`
                  }}
                  useNativeControls
                  resizeMode="contain"
                  isLooping={true}
                  shouldPlay={true}
                  isMuted={false}
                  onError={(error) => {
                    console.error('Video playback error:', error);
                    console.error('Video URL that failed:', selectedVideoUrl);
                    console.error('Full error object:', JSON.stringify(error));
                    
                    let errorMessage = 'Failed to play video. Please try again.';
                    
                    if (error && error.error) {
                      const errorStr = error.error.toString();
                      if (errorStr.includes('FileNotFoundException') || errorStr.includes('ENOENT')) {
                        errorMessage = 'Video file not found. The file may have been moved or deleted.';
                      } else if (errorStr.includes('Network') || errorStr.includes('connection')) {
                        errorMessage = 'Network error. Please check your internet connection.';
                      } else if (errorStr.includes('codec') || errorStr.includes('format')) {
                        errorMessage = 'Unsupported video format. Please try a different video.';
                      } else {
                        errorMessage = `Error: ${errorStr.substring(0, 100)}`;
                      }
                    }
                    
                    Alert.alert('Video Error', errorMessage, [
                      {
                        text: 'OK',
                        onPress: () => {
                          setShowVideoModal(false);
                          setSelectedVideoUrl(null);
                        }
                      }
                    ]);
                  }}
                  onLoad={(status) => {
                    console.log('Video loaded successfully!');
                    console.log('Video status:', status);
                    console.log('Video URL:', selectedVideoUrl);
                  }}
                  onLoadStart={() => {
                    console.log('Video loading started...');
                    console.log('Loading from:', selectedVideoUrl);
                  }}
                  onReadyForDisplay={(event) => {
                    console.log('Video ready for display:', event);
                  }}
                />
              ) : (
                <VideoView
                  ref={videoRef}
                  style={styles.videoPlayer}
                  source={{ 
                    uri: selectedVideoUrl.startsWith('http') ? selectedVideoUrl : `${BASE_URL}${selectedVideoUrl}`
                  }}
                  useNativeControls
                  resizeMode="contain"
                  shouldPlay={true}
                />
              )
            ) : selectedVideoUrl ? (
              <View style={[styles.videoPlayer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
                <Ionicons name="videocam-off" size={64} color="#666" />
                <Text style={{ color: '#fff', fontSize: 16, marginTop: 16, textAlign: 'center' }}>
                  Video player not available{'\n'}
                  Please install expo-av or expo-video
                </Text>
                <TouchableOpacity 
                  style={{ marginTop: 20, padding: 10, backgroundColor: '#333', borderRadius: 5 }}
                  onPress={() => {
                    setShowVideoModal(false);
                    setSelectedVideoUrl(null);
                  }}
                >
                  <Text style={{ color: '#fff' }}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Share Menu Modal */}
      <Modal
        visible={showShareMenu}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowShareMenu(false)}
      >
        <TouchableOpacity 
          style={styles.shareModalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareMenu(false)}
        >
          <View style={styles.shareMenuContainer}>
            <View style={styles.shareMenuHeader}>
              <Text style={styles.shareMenuTitle}>Share to</Text>
              <TouchableOpacity onPress={() => setShowShareMenu(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.shareOptionsContainer}>
              {/* WhatsApp */}
              <TouchableOpacity 
                style={styles.shareOption}
                onPress={() => shareToSocialMedia('whatsapp')}
              >
                <View style={[styles.shareIconContainer, { backgroundColor: '#25D366' }]}>
                  <Ionicons name="logo-whatsapp" size={32} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>WhatsApp</Text>
              </TouchableOpacity>

              {/* Facebook */}
              <TouchableOpacity 
                style={styles.shareOption}
                onPress={() => shareToSocialMedia('facebook')}
              >
                <View style={[styles.shareIconContainer, { backgroundColor: '#1877F2' }]}>
                  <Ionicons name="logo-facebook" size={32} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>Facebook</Text>
              </TouchableOpacity>

              {/* Instagram */}
              <TouchableOpacity 
                style={styles.shareOption}
                onPress={() => shareToSocialMedia('instagram')}
              >
                <View style={[styles.shareIconContainer, { backgroundColor: '#E4405F' }]}>
                  <Ionicons name="logo-instagram" size={32} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>Instagram</Text>
              </TouchableOpacity>

              {/* TikTok */}
              <TouchableOpacity 
                style={styles.shareOption}
                onPress={() => shareToSocialMedia('tiktok')}
              >
                <View style={[styles.shareIconContainer, { backgroundColor: '#000' }]}>
                  <Ionicons name="logo-tiktok" size={32} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>TikTok</Text>
              </TouchableOpacity>

              {/* More Options */}
              <TouchableOpacity 
                style={styles.shareOption}
                onPress={() => shareToSocialMedia('more')}
              >
                <View style={[styles.shareIconContainer, { backgroundColor: '#666' }]}>
                  <Ionicons name="share-social" size={32} color="#fff" />
                </View>
                <Text style={styles.shareOptionText}>More</Text>
              </TouchableOpacity>
            </View>
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
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginHorizontal: 20,
    color: '#333',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  createPostCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  createPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: 'white',
  },
  postInput: {
    flex: 1,
    fontSize: 16,
    color: '#666',
    marginRight: 12,
    minHeight: 40,
  },
  sendButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: 20,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  postCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  postInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  levelText: {
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    marginRight: 4,
  },
  roleText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  postContent: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  commentsContainer: {
    flex: 1,
    padding: 16,
  },
  commentItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  commentUser: {
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  commentContent: {
    color: '#666',
    marginBottom: 4,
  },
  commentTime: {
    fontSize: 12,
    color: '#999',
  },
  addCommentContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    maxHeight: 100,
  },
  commentSendButton: {
    backgroundColor: '#B39DDB',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaContainer: {
    marginVertical: 12,
  },
  mediaItem: {
    marginBottom: 8,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  videoContainer: {
    width: '100%',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  videoThumbnail: {
    width: '100%',
    height: 150,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  videoInfo: {
    padding: 12,
    backgroundColor: '#fff',
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  videoFilename: {
    fontSize: 12,
    color: '#666',
  },
  videoStatus: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  selectedMediaContainer: {
    marginVertical: 12,
  },
  selectedMediaItem: {
    position: 'relative',
    marginRight: 12,
  },
  selectedMediaPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  selectedVideoPreview: {
    width: 80,
    height: 80,
    backgroundColor: '#333',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  streamingUrlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  streamingUrlInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
    paddingVertical: 4,
  },
  videoUrlContainer: {
    marginVertical: 8,
  },
  inlineVideoContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  inlineVideo: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#FF6B35',
    gap: 6,
  },
  videoLinkText: {
    color: '#FF6B35',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  videoModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    position: 'relative',
  },
  videoModalContent: {
    position: 'absolute',
    top: Dimensions.get('window').height / 4, // Start from 25% of screen height
    height: Dimensions.get('window').height / 2, // 50% of screen height 
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 10,
  },
  videoPlayer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  youtubeVideoContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  youtubeThumbnail: {
    width: '100%',
    height: '100%',
  },
  youtubeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  youtubePlayButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 50,
    padding: 10,
    marginBottom: 8,
  },
  youtubeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  postInfoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  postMenuButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  postMenuDropdown: {
    position: 'absolute',
    top: 30,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
    minWidth: 120,
  },
  postMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  postMenuText: {
    fontSize: 14,
    fontWeight: '500',
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  shareMenuContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  shareMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  shareMenuTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  shareOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    justifyContent: 'space-around',
  },
  shareOption: {
    alignItems: 'center',
    width: '20%',
    marginVertical: 10,
  },
  shareIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shareOptionText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
});