
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';

export default function CreateFamilyScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [familyName, setFamilyName] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [autoJoin, setAutoJoin] = useState(true);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setCoverImage(result.assets[0].base64 || null);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const createFamily = async () => {
    if (!familyName.trim()) {
      Alert.alert('Error', 'Nama keluarga harus diisi');
      return;
    }

    if (!announcement.trim()) {
      Alert.alert('Error', 'Pengumuman keluarga harus diisi');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/families`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          name: familyName.trim(),
          description: announcement.trim(),
          coverImage: coverImage,
          autoJoin: autoJoin,
          createdBy: user?.username
        })
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Berhasil',
          'Keluarga berhasil dibuat!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert('Error', data.error || 'Gagal membuat keluarga');
      }
    } catch (error) {
      console.error('Error creating family:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat membuat keluarga');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buat Keluarga</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nama Keluarga */}
        <View style={styles.section}>
          <Text style={styles.label}>Nama Keluarga</Text>
          <TextInput
            style={styles.input}
            placeholder="mengisi nama keluarga"
            placeholderTextColor="#999"
            value={familyName}
            onChangeText={setFamilyName}
            maxLength={50}
          />
        </View>

        {/* Cover Keluarga */}
        <View style={styles.section}>
          <Text style={styles.label}>Cover Keluarga</Text>
          <TouchableOpacity style={styles.coverContainer} onPress={pickImage}>
            {coverImage ? (
              <Image 
                source={{ uri: `data:image/jpeg;base64,${coverImage}` }} 
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="camera" size={24} color="#666" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Pengumuman Keluarga */}
        <View style={styles.section}>
          <Text style={styles.label}>Pengumuman Keluarga</Text>
          <TextInput
            style={styles.announcementInput}
            placeholder="mengisi konten"
            placeholderTextColor="#999"
            value={announcement}
            onChangeText={setAnnouncement}
            maxLength={400}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>{announcement.length}/400</Text>
        </View>

        {/* Auto Join Toggle */}
        <View style={styles.toggleSection}>
          <Text style={styles.toggleLabel}>bergabung dengan keluarga tanpa ditinjau</Text>
          <Switch
            value={autoJoin}
            onValueChange={setAutoJoin}
            trackColor={{ false: '#E0E0E0', true: '#4CAF50' }}
            thumbColor={autoJoin ? '#fff' : '#f4f3f4'}
          />
        </View>
      </ScrollView>

      {/* Create Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={createFamily}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>membuat keluarga</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  coverContainer: {
    width: 120,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  announcementInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 120,
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 30,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    marginRight: 16,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    backgroundColor: '#F5F5F5',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
