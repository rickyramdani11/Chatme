import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import { useRoute, useNavigation } from '@react-navigation/native';
import { API_BASE_URL } from '../utils/apiConfig';

interface LiveChatMessage {
  id: string;
  message: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function LiveChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user, token } = useAuth();
  const { sessionId, adminUsername } = route.params as any;

  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 3 seconds
    const interval = setInterval(() => {
      fetchMessages();
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/support/live-chat/${sessionId}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        // Auto scroll to bottom when new messages arrive
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Error fetching live chat messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;

    setSending(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/support/live-chat/${sessionId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: messageText.trim(),
          }),
        }
      );

      if (response.ok) {
        setMessageText('');
        fetchMessages(); // Refresh messages immediately
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Gagal mengirim pesan');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Gagal mengirim pesan');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: LiveChatMessage }) => {
    const isOwnMessage = item.username === user?.username;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
      >
        {!isOwnMessage && (
          <View style={styles.messageSender}>
            <Ionicons
              name={item.isAdmin ? 'shield' : 'person'}
              size={14}
              color={item.isAdmin ? '#FF69B4' : '#666'}
            />
            <Text
              style={[
                styles.senderName,
                item.isAdmin && styles.adminName,
              ]}
            >
              {item.username}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownBubble : styles.otherBubble,
            item.isAdmin && !isOwnMessage && styles.adminBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isOwnMessage && styles.ownMessageText,
            ]}
          >
            {item.message}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {new Date(item.createdAt).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Live Chat Support</Text>
          <Text style={styles.headerSubtitle}>
            Dengan {adminUsername || 'Support'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.statusIndicator} />
          <Text style={styles.statusText}>Online</Text>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={60} color="#CCC" />
            <Text style={styles.emptyText}>
              Belum ada pesan. Mulai chat dengan admin support!
            </Text>
          </View>
        }
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Ketik pesan..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!messageText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    backgroundColor: '#6A0DAD',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#5A0C9D',
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#FFD700',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF00',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#FFF',
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 40,
  },
  messageContainer: {
    marginBottom: 16,
    maxWidth: '80%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageSender: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    fontWeight: '600',
  },
  adminName: {
    color: '#FF69B4',
  },
  messageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '100%',
  },
  ownBubble: {
    backgroundColor: '#6A0DAD',
  },
  otherBubble: {
    backgroundColor: '#E5E5EA',
  },
  adminBubble: {
    backgroundColor: '#FFE5F0',
    borderWidth: 1,
    borderColor: '#FF69B4',
  },
  messageText: {
    fontSize: 14,
    color: '#000',
  },
  ownMessageText: {
    color: '#FFF',
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
    color: '#000',
  },
  sendButton: {
    backgroundColor: '#6A0DAD',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
});
