import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Image,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const ProfileSection = () => (
    <View style={styles.profileSection}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            {user?.avatar ? (
              <Image 
                source={{ 
                  uri: user.avatar.startsWith('http') ? user.avatar : `${API_BASE_URL}${user.avatar}` 
                }} 
                style={styles.avatarImage} 
              />
            ) : (
              <Text style={styles.avatarText}>
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <View style={[styles.statusIndicator, { backgroundColor: '#4CAF50' }]} />
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationText}>A</Text>
          </View>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.username}>{user?.username || 'pengembang'}</Text>
          <Text style={styles.email}>{user?.email || 'meongkwl@gmail.com'}</Text>
          <View style={styles.badgeContainer}>
            <View style={styles.levelBadge}>
              <Ionicons name="trophy" size={12} color="#fff" />
              <Text style={styles.levelText}>Tingkat 1</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>Online</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.editProfileButton} onPress={handleEditProfile}>
        <Text style={styles.editProfileText}>Edit Profil</Text>
      </TouchableOpacity>
    </View>
  );

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  const handleLogout = () => {
    Alert.alert(
      'Konfirmasi Logout',
      'Apakah Anda yakin ingin keluar?',
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // The AuthContext will automatically handle navigation to auth screen
              // No need to manually navigate
            } catch (error) {
              console.error('Logout error:', error);
              // Even if logout fails, the auth context should handle it
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const SettingsItem = ({
    icon,
    title,
    hasSwitch,
    switchValue,
    onSwitchChange,
    hasArrow = true,
    onPress,
    iconColor = '#666',
    titleColor = '#333',
    badgeText
  }: {
    icon: string;
    title: string;
    hasSwitch?: boolean;
    switchValue?: boolean;
    onSwitchChange?: (value: boolean) => void;
    hasArrow?: boolean;
    onPress?: () => void;
    iconColor?: string;
    titleColor?: string;
    badgeText?: string;
  }) => (
    <TouchableOpacity
      style={styles.settingsItem}
      onPress={onPress}
      disabled={hasSwitch}
    >
      <View style={styles.settingsItemLeft}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
        <Text style={[styles.settingsItemText, { color: titleColor }]}>{title}</Text>
      </View>
      <View style={styles.settingsItemRight}>
        {badgeText && (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>{badgeText}</Text>
          </View>
        )}
        {hasSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: '#E0E0E0', true: '#9C27B0' }}
            thumbColor={switchValue ? '#fff' : '#fff'}
          />
        ) : hasArrow ? (
          <Ionicons name="chevron-forward" size={16} color="#999" />
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <ProfileSection />

        <View style={styles.settingsSection}>
          <SettingsItem
            icon="notifications"
            title="Pemberitahuan"
            hasSwitch
            switchValue={notifications}
            onSwitchChange={setNotifications}
            iconColor="#9C27B0"
          />

          <SettingsItem
            icon="moon"
            title="Mode Gelap"
            hasSwitch
            switchValue={darkMode}
            onSwitchChange={setDarkMode}
            iconColor="#9C27B0"
          />

          <SettingsItem
            icon="shield-checkmark"
            title="Privasi & Keamanan"
            iconColor="#9C27B0"
            onPress={() => navigation.navigate('PrivacySecurity')}
          />

          <SettingsItem
            icon="help-circle"
            title="Bantuan & Dukungan"
            iconColor="#9C27B0"
            onPress={() => navigation.navigate('HelpSupport')}
          />

          <SettingsItem
            icon="card"
            title="Kredit"
            iconColor="#9C27B0"
            onPress={() => navigation.navigate('Credit')}
          />

          <SettingsItem
            icon="wallet"
            title="Withdraw"
            iconColor="#4CAF50"
            onPress={() => navigation.navigate('Withdraw')}
          />

          {/* Mentor Menu Item */}
          <SettingsItem
            icon="school"
            title="Mentor"
            iconColor="#F44336"
            onPress={() => navigation.navigate('Mentor')}
          />

          {/* Toko Menu Item */}
          <SettingsItem
            icon="storefront"
            title="Toko"
            iconColor="#4CAF50"
            onPress={() => navigation.navigate('StoreScreen')}
          />

          {/* Admin Panel Menu Item - Only visible for admin users */}
          {user?.role === 'admin' && (
            <SettingsItem
              icon="shield-checkmark"
              title="Admin Panel"
              iconColor="#FF6B35"
              badgeText="ADMIN"
              onPress={() => navigation.navigate('AdminScreen')}
            />
          )}

          <SettingsItem
            icon="log-out"
            title="Keluar"
            iconColor="#F44336"
            titleColor="#F44336"
            hasArrow={false}
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  levelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  statusBadge: {
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  editProfileButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editProfileText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingsSection: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingsItemText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#333',
  },
  settingsItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  adminBadgeText: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Styles for Admin Panel menu item (if it were to be modified, not used in the final output based on the above)
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
});