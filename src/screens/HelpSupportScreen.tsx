import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { API_BASE_URL } from '../utils/apiConfig';


interface FAQCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

export default function HelpSupportScreen({ navigation }: any) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('faq');
  const [faqCategories, setFaqCategories] = useState<FAQCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [faqItems, setFaqItems] = useState<FAQItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [liveChatStatus, setLiveChatStatus] = useState<any>(null);

  // Create ticket form
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    message: '',
    category: 'technical',
    priority: 'medium'
  });

  useEffect(() => {
    fetchFAQCategories();
    fetchSupportTickets();
    checkLiveChatStatus();
  }, []);

  const fetchFAQCategories = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/faq/categories`);
      if (response.ok) {
        const categories = await response.json();
        setFaqCategories(categories);
      }
    } catch (error) {
      console.error('Error fetching FAQ categories:', error);
    }
  };

  const fetchFAQItems = async (category: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/faq/${category}`);
      if (response.ok) {
        const items = await response.json();
        setFaqItems(items);
        setSelectedCategory(category);
      }
    } catch (error) {
      console.error('Error fetching FAQ items:', error);
    }
  };

  const fetchSupportTickets = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/tickets`, {
        headers: {
          'Authorization': `Bearer ${user?.token}`,
        },
      });
      if (response.ok) {
        const ticketsData = await response.json();
        setTickets(ticketsData);
      }
    } catch (error) {
      console.error('Error fetching support tickets:', error);
    }
  };

  const checkLiveChatStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/live-chat/status`);
      if (response.ok) {
        const status = await response.json();
        setLiveChatStatus(status);
      }
    } catch (error) {
      console.error('Error checking live chat status:', error);
    }
  };

  const createSupportTicket = async () => {
    try {
      if (!ticketForm.subject || !ticketForm.message) {
        Alert.alert('Error', 'Silakan isi semua field yang diperlukan');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          subject: ticketForm.subject,
          description: ticketForm.message,
          category: ticketForm.category,
          priority: ticketForm.priority
        }),
      });

      if (response.ok) {
        const result = await response.json();
        Alert.alert('Berhasil', `Tiket support berhasil dibuat dengan ID: ${result.ticket?.id || 'Unknown'}`);
        setShowCreateTicket(false);
        setTicketForm({ subject: '', message: '', category: 'technical', priority: 'medium' });
        fetchSupportTickets();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create ticket' }));
        Alert.alert('Error', errorData.error || 'Gagal membuat tiket support');
      }
    } catch (error) {
      console.error('Error creating support ticket:', error);
      const errorMessage = error instanceof Error ? error.message : 'Gagal membuat tiket support';
      Alert.alert('Error', errorMessage);
    }
  };

  const startLiveChatSession = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/support/live-chat/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        Alert.alert('Live Chat', result.message);
        // Navigate to chat with support room
        navigation.navigate('Chat', { 
          roomId: result.supportRoomId,
          roomName: `Support - ${result.adminUsername}`,
          isSupport: true 
        });
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Gagal memulai live chat');
      }
    } catch (error) {
      console.error('Error starting live chat:', error);
      Alert.alert('Error', 'Terjadi kesalahan saat memulai live chat');
    }
  };

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'faq' && styles.activeTab]}
        onPress={() => setActiveTab('faq')}
      >
        <Ionicons name="help-circle" size={20} color={activeTab === 'faq' ? '#FF69B4' : '#666'} />
        <Text style={[styles.tabText, activeTab === 'faq' && styles.activeTabText]}>FAQ</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'tickets' && styles.activeTab]}
        onPress={() => setActiveTab('tickets')}
      >
        <Ionicons name="ticket" size={20} color={activeTab === 'tickets' ? '#FF69B4' : '#666'} />
        <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>Tiket</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
        onPress={() => setActiveTab('chat')}
      >
        <Ionicons name="chatbubble" size={20} color={activeTab === 'chat' ? '#FF69B4' : '#666'} />
        <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Live Chat</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFAQContent = () => {
    if (selectedCategory) {
      return (
        <View style={styles.content}>
          <View style={styles.categoryHeader}>
            <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FF69B4" />
            </TouchableOpacity>
            <Text style={styles.categoryTitle}>
              {faqCategories.find(cat => cat.id === selectedCategory)?.name}
            </Text>
          </View>

          <ScrollView style={styles.faqList}>
            {faqItems.map((item) => (
              <View key={item.id} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Text style={styles.faqAnswer}>{item.answer}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    return (
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Kategori Bantuan</Text>
        {faqCategories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={styles.categoryItem}
            onPress={() => fetchFAQItems(category.id)}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryDescription}>{category.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderTicketsContent = () => (
    <View style={styles.content}>
      <View style={styles.ticketsHeader}>
        <Text style={styles.sectionTitle}>Tiket Support Saya</Text>
        <TouchableOpacity
          style={styles.createTicketButton}
          onPress={() => setShowCreateTicket(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createTicketText}>Buat Tiket</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.ticketsList}>
        {tickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="ticket-outline" size={64} color="#ccc" />
            <Text style={styles.emptyStateText}>Belum ada tiket support</Text>
            <Text style={styles.emptyStateSubtext}>Buat tiket untuk mendapatkan bantuan</Text>
          </View>
        ) : (
          tickets.map((ticket) => (
            <TouchableOpacity key={ticket.id} style={styles.ticketItem}>
              <View style={styles.ticketHeader}>
                <Text style={styles.ticketId}>#{ticket.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(ticket.status)}</Text>
                </View>
              </View>
              <Text style={styles.ticketSubject}>{ticket.subject}</Text>
              <View style={styles.ticketMeta}>
                <Text style={styles.ticketCategory}>{ticket.category}</Text>
                <Text style={styles.ticketDate}>{new Date(ticket.createdAt).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderLiveChatContent = () => (
    <View style={styles.content}>
      <View style={styles.liveChatContainer}>
        <Ionicons name="chatbubbles" size={64} color="#FF69B4" />
        <Text style={styles.liveChatTitle}>Live Chat Support</Text>

        {liveChatStatus && (
          <View style={styles.chatStatusCard}>
            <View style={[styles.statusIndicator, { 
              backgroundColor: liveChatStatus.available ? '#4CAF50' : '#FF5722' 
            }]} />
            <Text style={styles.chatStatusText}>{liveChatStatus.message}</Text>
            {liveChatStatus.estimatedWaitTime && (
              <Text style={styles.waitTimeText}>
                Perkiraan waktu tunggu: {liveChatStatus.estimatedWaitTime}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.startChatButton, { 
            opacity: liveChatStatus?.available ? 1 : 0.5 
          }]}
          onPress={startLiveChatSession}
          disabled={!liveChatStatus?.available}
        >
          <Ionicons name="chatbubble" size={20} color="#fff" />
          <Text style={styles.startChatText}>
            {liveChatStatus?.available ? 'Mulai Chat' : 'Support Offline'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.alternativeText}>
          Atau buat tiket support untuk bantuan lebih lanjut
        </Text>
      </View>
    </View>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#2196F3';
      case 'waiting_admin': return '#FF9800';
      case 'resolved': return '#4CAF50';
      case 'closed': return '#757575';
      default: return '#757575';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open': return 'Terbuka';
      case 'waiting_admin': return 'Menunggu Admin';
      case 'resolved': return 'Selesai';
      case 'closed': return 'Ditutup';
      default: return status;
    }
  };

  const renderCreateTicketModal = () => (
    <Modal
      visible={showCreateTicket}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView 
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowCreateTicket(false)}>
            <Text style={styles.cancelButton}>Batal</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Buat Tiket Support</Text>
          <TouchableOpacity onPress={createSupportTicket}>
            <Text style={styles.saveButton}>Kirim</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Subjek</Text>
            <TextInput
              style={styles.formInput}
              value={ticketForm.subject}
              onChangeText={(text) => setTicketForm(prev => ({ ...prev, subject: text }))}
              placeholder="Masukkan subjek tiket"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Kategori</Text>
            <View style={styles.categorySelector}>
              {['technical', 'account', 'billing', 'features'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryOption,
                    ticketForm.category === cat && styles.selectedCategory
                  ]}
                  onPress={() => setTicketForm(prev => ({ ...prev, category: cat }))}
                >
                  <Text style={[
                    styles.categoryOptionText,
                    ticketForm.category === cat && styles.selectedCategoryText
                  ]}>
                    {getCategoryName(cat)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Prioritas</Text>
            <View style={styles.prioritySelector}>
              {['low', 'medium', 'high'].map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.priorityOption,
                    ticketForm.priority === priority && styles.selectedPriority
                  ]}
                  onPress={() => setTicketForm(prev => ({ ...prev, priority }))}
                >
                  <Text style={[
                    styles.priorityOptionText,
                    ticketForm.priority === priority && styles.selectedPriorityText
                  ]}>
                    {getPriorityName(priority)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Pesan</Text>
            <TextInput
              style={[styles.formInput, styles.textArea]}
              value={ticketForm.message}
              onChangeText={(text) => setTicketForm(prev => ({ ...prev, message: text }))}
              placeholder="Jelaskan masalah Anda secara detail..."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

  const getCategoryName = (category: string) => {
    const names = {
      technical: 'Teknis',
      account: 'Akun',
      billing: 'Pembayaran',
      features: 'Fitur'
    };
    return names[category] || category;
  };

  const getPriorityName = (priority: string) => {
    const names = {
      low: 'Rendah',
      medium: 'Sedang',
      high: 'Tinggi'
    };
    return names[priority] || priority;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bantuan & Dukungan</Text>
        <View style={styles.placeholder} />
      </View>

      {renderTabBar()}

      {activeTab === 'faq' && renderFAQContent()}
      {activeTab === 'tickets' && renderTicketsContent()}
      {activeTab === 'chat' && renderLiveChatContent()}

      {renderCreateTicketModal()}
    </View>
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
  headerBackButton: {
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF69B4',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#FF69B4',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#666',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  faqList: {
    flex: 1,
  },
  faqItem: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  ticketsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  createTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF69B4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  createTicketText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  ticketsList: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  ticketItem: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ticketId: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ticketMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ticketCategory: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  ticketDate: {
    fontSize: 12,
    color: '#666',
  },
  liveChatContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  liveChatTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 30,
  },
  chatStatusCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  chatStatusText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  waitTimeText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  startChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF69B4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    marginBottom: 20,
  },
  startChatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  alternativeText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
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
  cancelButton: {
    color: '#666',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  saveButton: {
    color: '#FF69B4',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 120,
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  selectedCategory: {
    backgroundColor: '#FF69B4',
    borderColor: '#FF69B4',
  },
  categoryOptionText: {
    color: '#666',
    fontSize: 14,
  },
  selectedCategoryText: {
    color: '#fff',
  },
  prioritySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectedPriority: {
    backgroundColor: '#FF69B4',
    borderColor: '#FF69B4',
  },
  priorityOptionText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedPriorityText: {
    color: '#fff',
  },
});