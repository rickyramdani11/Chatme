
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


interface Notification {
  id: string;
  type: 'follow_request' | 'follow_accepted' | 'credit_received' | 'message';
  fromUser: string;
  fromUserId: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export default function NotificationsScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowRequest = async (notificationId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch(`${API_BASE_URL}/follow-requests/${notificationId}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        Alert.alert('Sukses', `Follow request ${action === 'accept' ? 'diterima' : 'ditolak'}`);
        fetchNotifications(); // Refresh notifications
      } else {
        Alert.alert('Error', 'Gagal memproses permintaan');
      }
    } catch (error) {
      console.error('Error handling follow request:', error);
      Alert.alert('Error', 'Terjadi kesalahan');
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const renderNotification = (notification: Notification) => {
    const isFollowRequest = notification.type === 'follow_request';
    
    return (
      <View key={notification.id} style={[
        styles.notificationCard,
        !notification.isRead && styles.unreadNotification
      ]}>
        <View style={styles.notificationHeader}>
          <View style={styles.notificationIcon}>
            <Ionicons 
              name={
                notification.type === 'follow_request' ? 'person-add' :
                notification.type === 'follow_accepted' ? 'checkmark-circle' :
                notification.type === 'credit_received' ? 'wallet' : 'chatbubble'
              }
              size={20}
              color="#fff"
            />
          </View>
          <View style={styles.notificationContent}>
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            <Text style={styles.notificationMessage}>{notification.message}</Text>
            <Text style={styles.notificationTime}>
              {new Date(notification.createdAt).toLocaleDateString('id-ID')}
            </Text>
          </View>
        </View>

        {isFollowRequest && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleFollowRequest(notification.id, 'accept')}
            >
              <Text style={styles.acceptButtonText}>Terima</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleFollowRequest(notification.id, 'reject')}
            >
              <Text style={styles.rejectButtonText}>Tolak</Text>
            </TouchableOpacity>
          </View>
        )}

        {!notification.isRead && !isFollowRequest && (
          <TouchableOpacity
            style={styles.markReadButton}
            onPress={() => markAsRead(notification.id)}
          >
            <Text style={styles.markReadText}>Tandai Dibaca</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#8B5CF6', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <TouchableOpacity style={styles.clearButton}>
          <Ionicons name="trash" size={24} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Memuat notifikasi...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Tidak ada notifikasi</Text>
          </View>
        ) : (
          notifications.map(renderNotification)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 50,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  clearButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  notificationCard: {
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
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIcon: {
    backgroundColor: '#8B5CF6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  rejectButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  markReadButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  markReadText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
});
