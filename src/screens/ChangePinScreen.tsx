import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


export default function ChangePinScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasExistingPin, setHasExistingPin] = useState(false);

  useEffect(() => {
    checkExistingPin();
  }, []);

  const checkExistingPin = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/check-pin`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Attempt to parse error JSON
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setHasExistingPin(data.hasPin);
    } catch (error) {
      console.error('Error checking PIN:', error);
      Alert.alert('Error', 'Gagal memeriksa PIN. Silakan coba lagi.');
    }
  };

  const handleChangePin = async () => {
    if (!newPin) {
      Alert.alert('Error', 'PIN baru harus diisi');
      return;
    }

    if (newPin.length !== 6) {
      Alert.alert('Error', 'PIN harus terdiri dari 6 digit');
      return;
    }

    if (!/^\d+$/.test(newPin)) {
      Alert.alert('Error', 'PIN hanya boleh berisi angka');
      return;
    }

    if (hasExistingPin && !oldPin) {
      Alert.alert('Error', 'PIN lama harus diisi');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPin: hasExistingPin ? oldPin : '123456', // Default PIN for first time
          newPin
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Sukses', 
          hasExistingPin ? 'PIN berhasil diubah' : 'PIN berhasil dibuat',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        // Attempt to parse error JSON for more specific messages
        const errorData = await response.json().catch(() => ({}));
        Alert.alert('Error', errorData.error || data.error || 'Gagal mengubah PIN');
      }
    } catch (error) {
      console.error('Error changing PIN:', error);
      Alert.alert('Error', 'Terjadi kesalahan jaringan atau server tidak merespons. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ubah PIN</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.formContainer}>
          <Text style={styles.description}>
            {hasExistingPin 
              ? 'Masukkan PIN lama dan PIN baru untuk mengubah PIN akun Anda'
              : 'Buat PIN 6 digit untuk keamanan akun Anda. PIN default saat ini adalah 123456'
            }
          </Text>

          {/* Old PIN - Only show if user has existing PIN */}
          {hasExistingPin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>PIN Lama</Text>
              <TextInput
                style={styles.pinInput}
                value={oldPin}
                onChangeText={setOldPin}
                placeholder="Masukkan PIN lama"
                keyboardType="numeric"
                maxLength={6}
                secureTextEntry
              />
            </View>
          )}

          {/* New PIN */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>PIN Baru</Text>
            <TextInput
              style={styles.pinInput}
              value={newPin}
              onChangeText={setNewPin}
              placeholder="Masukkan PIN baru (6 digit)"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
            />
          </View>

          {/* PIN Info */}
          <View style={styles.infoContainer}>
            <Ionicons name="information-circle" size={20} color="#9C27B0" />
            <Text style={styles.infoText}>
              PIN harus terdiri dari 6 digit angka
            </Text>
          </View>

          {!hasExistingPin && (
            <View style={styles.infoContainer}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
              <Text style={styles.infoText}>
                PIN default yang berlaku saat ini: 123456
              </Text>
            </View>
          )}

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            onPress={handleChangePin}
            disabled={loading}
          >
            <Text style={styles.sendButtonText}>
              {loading ? 'Mengubah...' : hasExistingPin ? 'Ubah PIN' : 'Buat PIN'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
    marginTop: 20,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 4,
    color: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  sendButton: {
    backgroundColor: '#9C27B0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});