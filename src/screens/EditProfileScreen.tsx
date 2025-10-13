
import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  TextInput,
  Alert,
  Image,
  FlatList,
  Modal,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL, BASE_URL } from '../utils/apiConfig';


interface AlbumPhoto {
  id: string;
  image_url: string;
  filename: string;
  uploaded_at: string;
}

export default function EditProfileScreen({ navigation }: any) {
  const { user, token, updateProfile } = useAuth();
  const { colors, isDarkMode } = useTheme();
  
  const themedStyles = useMemo(() => createThemedStyles(colors, isDarkMode), [colors, isDarkMode]);
  
  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    bio: user?.bio || '',
    phone: user?.phone || '',
    gender: user?.gender || '',
    birthDate: user?.birthDate || '',
    country: user?.country || '',
    signature: user?.signature || '',
    avatar: user?.avatar || null
  });

  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [currentUploadType, setCurrentUploadType] = useState<'avatar' | 'album'>('avatar');
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<AlbumPhoto | null>(null);

  useEffect(() => {
    fetchAlbumPhotos();
  }, []);

  const fetchAlbumPhotos = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user?.id}/album`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAlbumPhotos(data.photos || []);
      }
    } catch (error) {
      console.error('Error fetching album:', error);
    }
  };

  const handleImagePicker = (type: 'avatar' | 'album') => {
    setCurrentUploadType(type);
    setShowImagePicker(true);
  };

  const pickImageFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: currentUploadType === 'avatar' ? [1, 1] : [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadImage(asset.base64!, asset.uri.split('/').pop() || 'image.jpg');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
    setShowImagePicker(false);
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: currentUploadType === 'avatar' ? [1, 1] : [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadImage(asset.base64!, asset.uri.split('/').pop() || 'image.jpg');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowImagePicker(false);
  };

  const uploadImage = async (base64Data: string, filename: string) => {
    try {
      if (currentUploadType === 'avatar') {
        console.log('Uploading avatar for user:', user?.id);
        const response = await fetch(`${API_BASE_URL}/users/${user?.id}/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({
            avatar: base64Data,
            filename
          }),
        });

        const result = await response.json();
        console.log('Avatar upload response:', result);

        if (response.ok) {
          setProfileData(prev => ({ ...prev, avatar: result.avatarUrl }));
          
          // Update user context by calling the profile update endpoint directly
          try {
            const profileResponse = await fetch(`${API_BASE_URL}/users/${user?.id}/profile`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : '',
              },
              body: JSON.stringify({
                avatar: result.avatarUrl
              }),
            });

            if (profileResponse.ok) {
              const updatedUser = await profileResponse.json();
              await updateProfile(updatedUser);
              Alert.alert('Success', 'Avatar berhasil diperbarui!');
            } else {
              Alert.alert('Success', 'Avatar uploaded but profile update failed');
            }
          } catch (profileError) {
            console.error('Profile update error:', profileError);
            Alert.alert('Success', 'Avatar uploaded successfully');
          }
        } else {
          Alert.alert('Error', result.error || 'Gagal mengupload avatar');
        }
      } else {
        console.log('Uploading album photo for user:', user?.id);
        const response = await fetch(`${API_BASE_URL}/users/${user?.id}/album`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({
            photo: base64Data,
            filename
          }),
        });

        const result = await response.json();
        console.log('Album upload response:', result);

        if (response.ok) {
          setAlbumPhotos(prev => [...prev, result]);
          Alert.alert('Success', 'Foto berhasil ditambahkan ke album!');
        } else {
          Alert.alert('Error', result.error || 'Gagal mengupload foto');
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Gagal mengupload gambar');
    }
  };

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return;

    Alert.alert(
      'Hapus Foto',
      'Apakah Anda yakin ingin menghapus foto ini?',
      [
        {
          text: 'Batal',
          style: 'cancel',
          onPress: () => setShowPhotoMenu(false)
        },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowPhotoMenu(false);
              
              const response = await fetch(
                `${API_BASE_URL}/users/${user?.id}/album/${selectedPhoto.id}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                  },
                }
              );

              if (response.ok) {
                // Remove photo from local state
                setAlbumPhotos(prev => prev.filter(photo => photo.id !== selectedPhoto.id));
                setSelectedPhoto(null);
                Alert.alert('Success', 'Foto berhasil dihapus!');
              } else {
                const errorData = await response.json();
                Alert.alert('Error', errorData.error || 'Gagal menghapus foto');
              }
            } catch (error) {
              console.error('Error deleting photo:', error);
              Alert.alert('Error', 'Gagal menghapus foto');
            }
          }
        }
      ]
    );
  };

  const handleSaveAsBackground = async () => {
    if (!selectedPhoto) return;

    try {
      setShowPhotoMenu(false);

      const response = await fetch(
        `${API_BASE_URL}/users/${user?.id}/profile-background`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({
            backgroundUrl: selectedPhoto.image_url
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        
        // Update user context with new background - direct state update
        if (user) {
          const updatedUser = {
            ...user,
            profileBackground: result.profileBackground
          };
          await updateProfile(updatedUser);
        }
        
        setSelectedPhoto(null);
        Alert.alert('Success', 'Foto berhasil disimpan sebagai background profile!');
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Gagal menyimpan background');
      }
    } catch (error) {
      console.error('Error saving background:', error);
      Alert.alert('Error', 'Gagal menyimpan background');
    }
  };

  const handleSave = async () => {
    try {
      // Prepare data with proper null handling for dates
      const updateData = {
        bio: profileData.bio,
        phone: profileData.phone,
        gender: profileData.gender || null,
        birthDate: profileData.birthDate && profileData.birthDate.trim() !== '' ? profileData.birthDate : null,
        country: profileData.country || null,
        signature: profileData.signature
      };

      const response = await fetch(`${API_BASE_URL}/users/${user?.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        await updateProfile({
          bio: profileData.bio,
          phone: profileData.phone
        });
        Alert.alert('Success', 'Profile berhasil diperbarui!');
        navigation.goBack();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Gagal memperbarui profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Gagal memperbarui profile');
    }
  };

  const renderAlbumPhoto = ({ item }: { item: AlbumPhoto }) => (
    <View style={styles.albumPhotoContainer}>
      <Image source={{ uri: `${BASE_URL}${item.image_url}` }} style={styles.albumPhoto} />
    </View>
  );

  return (
    <View style={themedStyles.container}>
      {/* Header */}
      <View style={themedStyles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={themedStyles.headerTitle}>Sunting</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={themedStyles.section}>
          <View style={styles.sectionHeader}>
            <Text style={themedStyles.sectionTitle}>Avatar</Text>
            <TouchableOpacity 
              style={styles.avatarContainer} 
              onPress={() => handleImagePicker('avatar')}
            >
              <View style={themedStyles.avatar}>
                {profileData.avatar ? (
                  <Image source={{ uri: `${BASE_URL}${profileData.avatar}` }} style={styles.avatarImage} />
                ) : (
                  <Text style={themedStyles.avatarText}>
                    {profileData.username.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.iconDefault} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Album Section */}
        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionTitle}>Album</Text>
          <Text style={themedStyles.sectionSubtitle}>
            Klik untuk mengubah atau menghapus foto. Seret foto untuk mengubah urutan.
          </Text>
          
          <View style={styles.albumContainer}>
            <TouchableOpacity 
              style={themedStyles.addPhotoButton}
              onPress={() => handleImagePicker('album')}
            >
              <Ionicons name="add" size={30} color={colors.iconDefault} />
            </TouchableOpacity>
            
            {albumPhotos.map((photo) => (
              <TouchableOpacity 
                key={photo.id} 
                style={styles.albumPhotoContainer}
                onPress={() => {
                  setSelectedPhoto(photo);
                  setShowPhotoMenu(true);
                }}
              >
                <Image source={{ uri: `${BASE_URL}${photo.image_url}` }} style={styles.albumPhoto} />
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={themedStyles.albumNote}>* Hanya tampilkan 5 foto pertama di beranda</Text>
        </View>

        {/* Profile Form */}
        <View style={themedStyles.section}>
          {/* Bio */}
          <View style={themedStyles.formItem}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Bio</Text>
              <TextInput
                style={[themedStyles.textInput, styles.multilineInput]}
                value={profileData.bio}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, bio: text }))}
                placeholder="Ceritakan tentang diri Anda"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={themedStyles.formItem}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Telepon</Text>
              <TextInput
                style={themedStyles.textInput}
                value={profileData.phone}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, phone: text }))}
                placeholder="Nomor telepon"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Gender */}
          <TouchableOpacity style={themedStyles.formItem} onPress={() => setShowGenderPicker(true)}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Jenis kelamin</Text>
              <Text style={themedStyles.formValue}>{profileData.gender}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.iconDefault} />
          </TouchableOpacity>

          {/* Birth Date */}
          <TouchableOpacity style={themedStyles.formItem} onPress={() => setShowDatePicker(true)}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Ulang tahun</Text>
              <Text style={themedStyles.formValue}>{profileData.birthDate}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.iconDefault} />
          </TouchableOpacity>

          {/* Country */}
          <TouchableOpacity style={themedStyles.formItem} onPress={() => setShowCountryPicker(true)}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Negara/Wilayah</Text>
              <Text style={themedStyles.formValue}>{profileData.country}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.iconDefault} />
          </TouchableOpacity>

          {/* Signature */}
          <View style={themedStyles.formItem}>
            <View style={styles.formHeader}>
              <Text style={themedStyles.formLabel}>Tanda tangan</Text>
              <TextInput
                style={themedStyles.textInput}
                value={profileData.signature}
                onChangeText={(text) => setProfileData(prev => ({ ...prev, signature: text }))}
                placeholder="Tanda tangan Anda"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>

        {/* Save Button */}
        <View style={themedStyles.section}>
          <TouchableOpacity style={themedStyles.saveButton} onPress={handleSave}>
            <Text style={themedStyles.saveButtonText}>Simpan Perubahan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Gender Picker Modal */}
      <Modal
        visible={showGenderPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <View style={themedStyles.modalContent}>
            <Text style={themedStyles.modalTitle}>Pilih Jenis Kelamin</Text>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => {
                setProfileData(prev => ({ ...prev, gender: 'Pria' }));
                setShowGenderPicker(false);
              }}
            >
              <Text style={themedStyles.modalButtonText}>Pria</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => {
                setProfileData(prev => ({ ...prev, gender: 'Wanita' }));
                setShowGenderPicker(false);
              }}
            >
              <Text style={themedStyles.modalButtonText}>Wanita</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.cancelButton]} 
              onPress={() => setShowGenderPicker(false)}
            >
              <Text style={themedStyles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <View style={themedStyles.modalContent}>
            <Text style={themedStyles.modalTitle}>Pilih Negara/Wilayah</Text>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => {
                setProfileData(prev => ({ ...prev, country: 'Indonesia' }));
                setShowCountryPicker(false);
              }}
            >
              <Text style={themedStyles.modalButtonText}>Indonesia</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => {
                setProfileData(prev => ({ ...prev, country: 'Malaysia' }));
                setShowCountryPicker(false);
              }}
            >
              <Text style={themedStyles.modalButtonText}>Malaysia</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => {
                setProfileData(prev => ({ ...prev, country: 'Singapura' }));
                setShowCountryPicker(false);
              }}
            >
              <Text style={themedStyles.modalButtonText}>Singapura</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.cancelButton]} 
              onPress={() => setShowCountryPicker(false)}
            >
              <Text style={themedStyles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <View style={themedStyles.modalContent}>
            <Text style={themedStyles.modalTitle}>Pilih Tanggal Lahir</Text>
            <Text style={themedStyles.modalSubtitle}>Format: YYYY-MM-DD</Text>
            
            <TextInput
              style={themedStyles.dateInput}
              value={profileData.birthDate}
              onChangeText={(text) => setProfileData(prev => ({ ...prev, birthDate: text }))}
              placeholder="1995-03-24"
              placeholderTextColor={colors.textSecondary}
            />
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={themedStyles.modalButtonText}>Simpan</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.cancelButton]} 
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={themedStyles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Picker Modal */}
      <Modal
        visible={showImagePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowImagePicker(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <View style={themedStyles.modalContent}>
            <Text style={themedStyles.modalTitle}>Upload Photo</Text>
            <Text style={themedStyles.modalSubtitle}>Pilih sumber foto</Text>
            
            <TouchableOpacity style={themedStyles.modalButton} onPress={takePhoto}>
              <Ionicons name="camera" size={24} color={colors.primary} />
              <Text style={themedStyles.modalButtonText}>Camera</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={themedStyles.modalButton} onPress={pickImageFromLibrary}>
              <Ionicons name="images" size={24} color={colors.primary} />
              <Text style={themedStyles.modalButtonText}>Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.cancelButton]} 
              onPress={() => setShowImagePicker(false)}
            >
              <Text style={themedStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Menu Modal */}
      <Modal
        visible={showPhotoMenu}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPhotoMenu(false)}
      >
        <View style={themedStyles.modalOverlay}>
          <View style={themedStyles.modalContent}>
            <Text style={themedStyles.modalTitle}>Opsi Foto</Text>
            <Text style={themedStyles.modalSubtitle}>Pilih tindakan untuk foto ini</Text>
            
            <TouchableOpacity 
              style={themedStyles.modalButton} 
              onPress={handleSaveAsBackground}
            >
              <Ionicons name="image" size={24} color={colors.primary} />
              <Text style={themedStyles.modalButtonText}>Save Background</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.deleteButton]} 
              onPress={handleDeletePhoto}
            >
              <Ionicons name="trash" size={24} color={colors.error} />
              <Text style={themedStyles.deleteButtonText}>Delete Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[themedStyles.modalButton, themedStyles.cancelButton]} 
              onPress={() => setShowPhotoMenu(false)}
            >
              <Text style={themedStyles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createThemedStyles = (colors: any, isDarkMode: boolean) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: colors.shadow,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 15,
    shadowColor: colors.shadow,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 15,
    lineHeight: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.avatarBg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 10,
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    color: colors.badgeTextLight,
    fontWeight: 'bold' as const,
    fontSize: 18,
  },
  addPhotoButton: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 10,
    marginBottom: 10,
  },
  albumNote: {
    fontSize: 12,
    color: colors.error,
    fontStyle: 'italic' as const,
  },
  formItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 2,
  },
  formValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 30,
  },
  modalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  modalButtonText: {
    fontSize: 16,
    color: colors.primary,
    marginLeft: 15,
    fontWeight: '500' as const,
  },
  cancelButton: {
    backgroundColor: colors.error,
    marginTop: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    color: colors.badgeTextLight,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
    flex: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 5,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center' as const,
    marginHorizontal: 20,
  },
  saveButtonText: {
    color: colors.badgeTextLight,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
    color: colors.text,
  },
  deleteButton: {
    backgroundColor: colors.errorBadgeBg,
  },
  deleteButtonText: {
    fontSize: 16,
    color: colors.error,
    marginLeft: 15,
    fontWeight: '500' as const,
  },
});

const styles = StyleSheet.create({
  backButton: {
    padding: 5,
  },
  headerRight: {
    width: 34,
  },
  content: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    resizeMode: 'cover',
  },
  albumContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  albumPhotoContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
    marginBottom: 10,
  },
  albumPhoto: {
    width: '100%',
    height: '100%',
  },
  formHeader: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
