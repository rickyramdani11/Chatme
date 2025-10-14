import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_BASE_URL } from '../utils/apiConfig';

interface Announcement {
  id: number;
  title: string;
  message: string;
  type: string;
  is_active: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  token: string;
}

const AnnouncementManagement: React.FC<Props> = ({ token }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'info',
    is_active: true
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/admin/announcements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data.announcements || []);
      } else {
        Alert.alert('Error', 'Failed to fetch announcements');
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      Alert.alert('Error', 'Failed to fetch announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.message) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      const url = editingId
        ? `${API_BASE_URL}/admin/announcements/${editingId}`
        : `${API_BASE_URL}/admin/announcements`;

      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        Alert.alert('Success', editingId ? 'Announcement updated!' : 'Announcement created!');
        setFormData({ title: '', message: '', type: 'info', is_active: true });
        setShowAddForm(false);
        setEditingId(null);
        fetchAnnouncements();
      } else {
        Alert.alert('Error', 'Failed to save announcement');
      }
    } catch (error) {
      console.error('Error saving announcement:', error);
      Alert.alert('Error', 'Failed to save announcement');
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
      is_active: announcement.is_active
    });
    setEditingId(announcement.id);
    setShowAddForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert(
      'Delete Announcement',
      'Are you sure you want to delete this announcement?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/admin/announcements/${id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });

              if (response.ok) {
                Alert.alert('Success', 'Announcement deleted!');
                fetchAnnouncements();
              } else {
                Alert.alert('Error', 'Failed to delete announcement');
              }
            } catch (error) {
              console.error('Error deleting announcement:', error);
              Alert.alert('Error', 'Failed to delete announcement');
            }
          }
        }
      ]
    );
  };

  const handleToggleActive = async (id: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/announcements/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchAnnouncements();
      } else {
        Alert.alert('Error', 'Failed to toggle announcement status');
      }
    } catch (error) {
      console.error('Error toggling announcement:', error);
      Alert.alert('Error', 'Failed to toggle announcement status');
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info': return '#2196F3';
      case 'warning': return '#FF9800';
      case 'error': return '#F44336';
      case 'success': return '#4CAF50';
      default: return '#2196F3';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return 'information-circle';
      case 'warning': return 'warning';
      case 'error': return 'alert-circle';
      case 'success': return 'checkmark-circle';
      default: return 'information-circle';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📢 Login Announcements</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setShowAddForm(!showAddForm);
            setEditingId(null);
            setFormData({ title: '', message: '', type: 'info', is_active: true });
          }}
        >
          <Ionicons name={showAddForm ? 'close' : 'add'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {editingId ? 'Edit Announcement' : 'Create New Announcement'}
          </Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
            placeholder="Enter announcement title"
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.message}
            onChangeText={(text) => setFormData({ ...formData, message: text })}
            placeholder="Enter announcement message"
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeContainer}>
            {['info', 'warning', 'error', 'success'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeButton,
                  formData.type === type && { backgroundColor: getTypeColor(type) }
                ]}
                onPress={() => setFormData({ ...formData, type })}
              >
                <Ionicons 
                  name={getTypeIcon(type) as any} 
                  size={20} 
                  color={formData.type === type ? '#fff' : '#666'} 
                />
                <Text style={[
                  styles.typeText,
                  formData.type === type && { color: '#fff' }
                ]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <LinearGradient
              colors={['#FF6B35', '#F7931E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              <Text style={styles.submitText}>
                {editingId ? 'Update' : 'Create'} Announcement
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Active Announcements ({announcements.length})</Text>

        {announcements.map((announcement) => (
          <View key={announcement.id} style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <View style={styles.typeIndicator}>
                <Ionicons 
                  name={getTypeIcon(announcement.type) as any} 
                  size={20} 
                  color={getTypeColor(announcement.type)} 
                />
                <Text style={[styles.typeLabel, { color: getTypeColor(announcement.type) }]}>
                  {announcement.type.toUpperCase()}
                </Text>
              </View>
              <View style={styles.statusContainer}>
                <Text style={styles.statusLabel}>Active</Text>
                <Switch
                  value={announcement.is_active}
                  onValueChange={() => handleToggleActive(announcement.id)}
                  trackColor={{ false: '#ccc', true: '#4CAF50' }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <Text style={styles.announcementTitle}>{announcement.title}</Text>
            <Text style={styles.announcementMessage}>{announcement.message}</Text>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="eye" size={16} color="#666" />
                <Text style={styles.statText}>{announcement.view_count} views</Text>
              </View>
              <Text style={styles.dateText}>
                {new Date(announcement.created_at).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => handleEdit(announcement)}
              >
                <Ionicons name="pencil" size={18} color="#2196F3" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(announcement.id)}
              >
                <Ionicons name="trash" size={18} color="#F44336" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {announcements.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="megaphone-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No announcements yet</Text>
            <Text style={styles.emptySubtext}>Create your first login announcement</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  addButton: {
    backgroundColor: '#FF6B35',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  formContainer: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333'
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top'
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    gap: 6
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666'
  },
  submitButton: {
    marginTop: 20,
    borderRadius: 8,
    overflow: 'hidden'
  },
  submitGradient: {
    paddingVertical: 14,
    alignItems: 'center'
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  listContainer: {
    padding: 16
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333'
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  typeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: 'bold'
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusLabel: {
    fontSize: 12,
    color: '#666'
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  announcementMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0'
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statText: {
    fontSize: 12,
    color: '#666'
  },
  dateText: {
    fontSize: 12,
    color: '#999'
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#E3F2FD'
  },
  editButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFEBEE'
  },
  deleteButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 14
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#999',
    marginTop: 16
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4
  }
});

export default AnnouncementManagement;
