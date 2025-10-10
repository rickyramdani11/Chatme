
import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { useTheme } from '../contexts/ThemeContext';
import { API_BASE_URL } from '../utils/apiConfig';

interface PrivacySettings {
  profile_visibility: 'public' | 'private' | 'friends_only';
  privacy_notifications: boolean;
  location_sharing: boolean;
  biometric_auth: boolean;
  two_factor_auth: boolean;
  active_sessions: boolean;
  data_download: boolean;
}

export default function PrivacySecurityScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const { colors } = useTheme();
  const [settings, setSettings] = useState<PrivacySettings>({
    profile_visibility: 'public',
    privacy_notifications: true,
    location_sharing: true,
    biometric_auth: false,
    two_factor_auth: true,
    active_sessions: true,
    data_download: true
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPrivacySettings();
  }, []);

  const fetchPrivacySettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${user?.id}/privacy-settings`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
    }
  };

  const updatePrivacySetting = async (key: keyof PrivacySettings, value: any) => {
    try {
      setLoading(true);
      console.log(`Updating privacy setting: ${key} = ${value}`);
      
      const response = await fetch(`${API_BASE_URL}/users/${user?.id}/privacy-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({
          [key]: value
        }),
      });

      console.log('Privacy settings update response status:', response.status);
      
      if (response.ok) {
        let responseData;
        try {
          responseData = await response.json();
          console.log('Privacy settings update response data:', responseData);
        } catch (parseError) {
          console.error('Error parsing response JSON:', parseError);
          // Even if JSON parsing fails, if status is ok, treat as success
          responseData = { success: true };
        }

        // Check if response indicates success
        if (responseData.success !== false) {
          setSettings(prev => ({ ...prev, [key]: value }));
          Alert.alert('Berhasil', 'Pengaturan privasi berhasil diperbarui');
        } else {
          console.error('Backend returned success: false', responseData);
          Alert.alert('Error', responseData.error || 'Gagal memperbarui pengaturan');
        }
      } else {
        let errorData;
        try {
          errorData = await response.json();
          console.error('Privacy settings update error response:', errorData);
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          errorData = { error: 'Unknown error' };
        }
        Alert.alert('Error', errorData.error || 'Gagal memperbarui pengaturan');
      }
    } catch (error) {
      console.error('Network error updating privacy setting:', error);
      Alert.alert('Error', 'Terjadi kesalahan jaringan saat memperbarui pengaturan');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword');
  };

  const handleChangePin = () => {
    navigation.navigate('ChangePin');
  };

  const handleDownloadData = async () => {
    Alert.alert(
      'Unduh Data',
      'Permintaan unduh data akan diproses. Anda akan menerima notifikasi ketika data siap diunduh.',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Lanjutkan', 
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/users/${user?.id}/download-data`, {
                method: 'POST',
                headers: {
                  'Authorization': token ? `Bearer ${token}` : '',
                  'Content-Type': 'application/json',
                  'User-Agent': 'ChatMe-Mobile-App',
                },
              });

              if (response.ok) {
                Alert.alert('Berhasil', 'Permintaan unduh data telah dikirim');
              } else {
                Alert.alert('Error', 'Gagal memproses permintaan');
              }
            } catch (error) {
              console.error('Error requesting data download:', error);
              Alert.alert('Error', 'Terjadi kesalahan');
            }
          }
        }
      ]
    );
  };

  const themedStyles = useMemo(() => ({
    container: {
      ...styles.container,
      backgroundColor: colors.background,
    },
    header: {
      ...styles.header,
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...styles.headerTitle,
      color: colors.text,
    },
    sectionTitle: {
      ...styles.sectionTitle,
      color: colors.text,
    },
    sectionContent: {
      ...styles.sectionContent,
      backgroundColor: colors.card,
      shadowColor: colors.shadow,
    },
    securityItem: {
      ...styles.securityItem,
      borderBottomColor: colors.border,
    },
    securityItemTitle: {
      ...styles.securityItemTitle,
      color: colors.text,
    },
    securityItemDescription: {
      ...styles.securityItemDescription,
      color: colors.textSecondary,
    },
  }), [colors]);

  const SecurityItem = ({ 
    icon, 
    title, 
    description,
    onPress,
    iconColor = colors.primary,
    hasSwitch = false,
    switchValue,
    onSwitchChange
  }: {
    icon: string;
    title: string;
    description?: string;
    onPress?: () => void;
    iconColor?: string;
    hasSwitch?: boolean;
    switchValue?: boolean;
    onSwitchChange?: (value: boolean) => void;
  }) => (
    <TouchableOpacity 
      style={themedStyles.securityItem} 
      onPress={onPress}
      disabled={hasSwitch}
    >
      <View style={styles.securityItemLeft}>
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={icon as any} size={24} color={iconColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={themedStyles.securityItemTitle}>{title}</Text>
          {description && (
            <Text style={themedStyles.securityItemDescription}>{description}</Text>
          )}
        </View>
      </View>
      {hasSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.border, true: iconColor }}
          thumbColor={colors.switchThumb}
          disabled={loading}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
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
        <Text style={themedStyles.headerTitle}>Privasi & Keamanan</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Account Security Section */}
        <View style={styles.section}>
          <Text style={themedStyles.sectionTitle}>Keamanan Akun</Text>
          <View style={themedStyles.sectionContent}>
            <SecurityItem
              icon="key"
              title="Ubah Password"
              description="Perbarui password untuk keamanan akun"
              onPress={handleChangePassword}
              iconColor={colors.warning}
            />
            
            <SecurityItem
              icon="keypad"
              title="Ubah PIN"
              description="Atur PIN untuk akses cepat"
              onPress={handleChangePin}
              iconColor={colors.success}
            />
          </View>
        </View>

        {/* Privacy Settings Section */}
        <View style={styles.section}>
          <Text style={themedStyles.sectionTitle}>Pengaturan Privasi</Text>
          <View style={themedStyles.sectionContent}>
            <SecurityItem
              icon="eye"
              title="Visibilitas Profil"
              description={`Profil ${settings.profile_visibility === 'public' ? 'publik' : settings.profile_visibility === 'private' ? 'privat' : 'teman saja'}`}
              iconColor={colors.info}
              hasSwitch={true}
              switchValue={settings.profile_visibility === 'public'}
              onSwitchChange={(value) => updatePrivacySetting('profile_visibility', value ? 'public' : 'private')}
            />
            
            <SecurityItem
              icon="notifications"
              title="Notifikasi Privasi"
              description="Kelola notifikasi terkait privasi"
              iconColor={colors.primary}
              hasSwitch={true}
              switchValue={settings.privacy_notifications}
              onSwitchChange={(value) => updatePrivacySetting('privacy_notifications', value)}
            />
            
            <SecurityItem
              icon="location"
              title="Berbagi Lokasi"
              description="Pengaturan berbagi lokasi"
              iconColor={colors.warning}
              hasSwitch={true}
              switchValue={settings.location_sharing}
              onSwitchChange={(value) => updatePrivacySetting('location_sharing', value)}
            />
          </View>
        </View>

        {/* Security Features Section */}
        <View style={styles.section}>
          <Text style={themedStyles.sectionTitle}>Fitur Keamanan</Text>
          <View style={themedStyles.sectionContent}>
            <SecurityItem
              icon="shield-checkmark"
              title="Verifikasi Dua Langkah"
              description="Tingkatkan keamanan dengan 2FA"
              iconColor={colors.info}
              hasSwitch={true}
              switchValue={settings.two_factor_auth}
              onSwitchChange={(value) => updatePrivacySetting('two_factor_auth', value)}
            />
            
            <SecurityItem
              icon="time"
              title="Sesi Aktif"
              description="Lihat dan kelola sesi login aktif"
              iconColor={colors.textSecondary}
              hasSwitch={true}
              switchValue={settings.active_sessions}
              onSwitchChange={(value) => updatePrivacySetting('active_sessions', value)}
            />
          </View>
        </View>

        {/* Data & Privacy Section */}
        <View style={styles.section}>
          <Text style={themedStyles.sectionTitle}>Data & Privasi</Text>
          <View style={themedStyles.sectionContent}>
            <SecurityItem
              icon="download"
              title="Unduh Data Saya"
              description="Unduh salinan data pribadi Anda"
              iconColor={colors.textSecondary}
              hasSwitch={true}
              switchValue={settings.data_download}
              onSwitchChange={(value) => {
                updatePrivacySetting('data_download', value);
                if (value) {
                  handleDownloadData();
                }
              }}
            />
            
            <SecurityItem
              icon="trash"
              title="Hapus Akun"
              description="Hapus akun dan semua data permanen"
              iconColor={colors.error}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 20,
    marginBottom: 10,
  },
  sectionContent: {
    marginHorizontal: 20,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  securityItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  securityItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  securityItemDescription: {
    fontSize: 14,
  },
});
