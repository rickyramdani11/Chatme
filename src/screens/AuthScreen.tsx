import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  Animated, 
  Dimensions,
  ScrollView,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

const countries = [
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', dialCode: '+62' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dialCode: '+44' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', dialCode: '+65' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', dialCode: '+60' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', dialCode: '+66' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', dialCode: '+84' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', dialCode: '+63' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', dialCode: '+81' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', dialCode: '+82' },
  { code: 'CN', name: 'China', flag: '🇨🇳', dialCode: '+86' },
  { code: 'IN', name: 'India', flag: '🇮🇳', dialCode: '+91' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', dialCode: '+61' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', dialCode: '+49' },
  { code: 'FR', name: 'France', flag: '🇫🇷', dialCode: '+33' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', dialCode: '+39' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', dialCode: '+34' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dialCode: '+1' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', dialCode: '+55' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', dialCode: '+52' },
];

export default function AuthScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const { login, register } = useAuth();

  // Load remembered credentials on mount
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const credentials = await AsyncStorage.getItem('rememberedCredentials');
        if (credentials) {
          const { username: rememberedUsername, password: rememberedPassword } = JSON.parse(credentials);
          setUsername(rememberedUsername);
          setPassword(rememberedPassword);
          setRememberMe(true);
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      }
    };
    loadCredentials();
  }, []);


  // Animation values
  const animatedValue1 = new Animated.Value(0);
  const animatedValue2 = new Animated.Value(0);
  const animatedValue3 = new Animated.Value(0);

  useEffect(() => {
    // Create floating animation for background elements
    const createAnimation = (animatedValue: Animated.Value, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      );
    };

    createAnimation(animatedValue1, 3000).start();
    createAnimation(animatedValue2, 4000).start();
    createAnimation(animatedValue3, 5000).start();
  }, []);

  const handleSubmit = async () => {
    if (isLogin) {
      if (!username || !password) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }
    } else {
      if (!username || !password || !email || !phone || !gender) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters long');
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);

        // Handle Remember Me
        if (rememberMe) {
          await AsyncStorage.setItem('rememberedCredentials', JSON.stringify({ username, password }));
        } else {
          await AsyncStorage.removeItem('rememberedCredentials');
        }

        Alert.alert('Success', 'Login successful!');
      } else {
        await register(username, password, email, phone, selectedCountry.code, gender);
        Alert.alert(
          'Account Created', 
          `Verification link has been sent to ${email}. Please check your email to verify your account before logging in.`,
          [{ text: 'OK', onPress: () => setIsLogin(true) }]
        );
      }
    } catch (error) {
      console.error('Auth error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      Alert.alert('Error', errorMessage);
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      // In a real app, you would call your backend API here
      // For demo purposes, we'll show a success message
      Alert.alert(
        'Reset Link Sent',
        `Password reset instructions have been sent to ${resetEmail}. Please check your email.`,
        [{ text: 'OK', onPress: () => setShowForgotPassword(false) }]
      );
      setResetEmail('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send reset email. Please try again.');
    }
  };

  const translateY1 = animatedValue1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -30],
  });

  const translateY2 = animatedValue2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 25],
  });

  const translateY3 = animatedValue3.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const opacity1 = animatedValue1.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  const opacity2 = animatedValue2.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.2, 0.6, 0.2],
  });

  const opacity3 = animatedValue3.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.9, 0.4],
  });

  const renderCountryModal = () => (
    <Modal
      visible={showCountryModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowCountryModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <TouchableOpacity onPress={() => setShowCountryModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.countryList}>
            {countries.map((country) => (
              <TouchableOpacity
                key={country.code}
                style={styles.countryItem}
                onPress={() => {
                  setSelectedCountry(country);
                  setShowCountryModal(false);
                }}
              >
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryName}>{country.name}</Text>
                <Text style={styles.countryCode}>{country.dialCode}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderForgotPasswordModal = () => (
    <Modal
      visible={showForgotPassword}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowForgotPassword(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Forgot Password</Text>
            <TouchableOpacity onPress={() => setShowForgotPassword(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={styles.forgotPasswordForm}>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#999"
              value={resetEmail}
              onChangeText={setResetEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={styles.button}
              onPress={handleForgotPassword}
            >
              <Text style={styles.buttonText}>Send Reset Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );


  return (
    <View style={styles.container}>
      {/* Animated Background Elements */}
      <Animated.View
        style={[
          styles.backgroundCircle,
          styles.circle1,
          {
            transform: [{ translateY: translateY1 }],
            opacity: opacity1,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.backgroundCircle,
          styles.circle2,
          {
            transform: [{ translateY: translateY2 }],
            opacity: opacity2,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.backgroundCircle,
          styles.circle3,
          {
            transform: [{ translateY: translateY3 }],
            opacity: opacity3,
          },
        ]}
      />

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          <View style={styles.formContainer}>
            <Text style={styles.title}>
              {isLogin ? 'ChatMe' : 'Create Account'}
            </Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Sign in to continue' : 'Join us today'}
            </Text>

            {/* Username Input */}
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#FF6B35" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#FF6B35" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#FF6B35"
                />
              </TouchableOpacity>
            </View>

            {/* Signup-only fields */}
            {!isLogin && (
              <>
                {/* Email Input */}
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color="#FF6B35" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                {/* Phone Input with Country Selector */}
                <View style={styles.phoneContainer}>
                  <TouchableOpacity 
                    style={styles.countrySelector}
                    onPress={() => setShowCountryModal(true)}
                  >
                    <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                    <Text style={styles.dialCode}>{selectedCountry.dialCode}</Text>
                    <Ionicons name="chevron-down" size={16} color="#FF6B35" />
                  </TouchableOpacity>
                  <View style={styles.phoneInputContainer}>
                    <Ionicons name="call-outline" size={20} color="#FF6B35" style={styles.inputIcon} />
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="Phone Number"
                      placeholderTextColor="#999"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                {/* Gender Selection */}
                <View style={styles.genderContainer}>
                  <Text style={styles.genderLabel}>Gender</Text>
                  <View style={styles.genderButtons}>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        gender === 'male' && styles.genderButtonActive
                      ]}
                      onPress={() => setGender('male')}
                    >
                      <Ionicons 
                        name="man-outline" 
                        size={20} 
                        color={gender === 'male' ? '#fff' : '#FF6B35'} 
                      />
                      <Text style={[
                        styles.genderButtonText,
                        gender === 'male' && styles.genderButtonTextActive
                      ]}>
                        Male
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.genderButton,
                        gender === 'female' && styles.genderButtonActive
                      ]}
                      onPress={() => setGender('female')}
                    >
                      <Ionicons 
                        name="woman-outline" 
                        size={20} 
                        color={gender === 'female' ? '#fff' : '#FF6B35'} 
                      />
                      <Text style={[
                        styles.genderButtonText,
                        gender === 'female' && styles.genderButtonTextActive
                      ]}>
                        Female
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            {/* Remember Me and Forgot Password */}
            {isLogin && (
              <View style={styles.optionsContainer}>
                <TouchableOpacity
                  style={styles.rememberMeContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                >
                  <Ionicons
                    name={rememberMe ? "checkbox" : "square-outline"}
                    size={20}
                    color="#FF6B35"
                  />
                  <Text style={styles.rememberMeText}>Remember Me</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowForgotPassword(true)}>
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Send'}
              </Text>
            </TouchableOpacity>

            {/* Switch Auth Mode */}
            <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchContainer}>
              <Text style={styles.switchText}>
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {renderCountryModal()}
      {renderForgotPasswordModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  backgroundCircle: {
    position: 'absolute',
    borderRadius: 200,
  },
  circle1: {
    width: 300,
    height: 300,
    backgroundColor: '#FF6B35',
    top: -150,
    right: -100,
  },
  circle2: {
    width: 200,
    height: 200,
    backgroundColor: '#FF8E53',
    bottom: -100,
    left: -50,
  },
  circle3: {
    width: 150,
    height: 150,
    backgroundColor: '#FFA726',
    top: height * 0.3,
    right: -75,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 15,
    height: 55,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  passwordInput: {
    paddingRight: 45,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    padding: 5,
  },
  phoneContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    height: 55,
    minWidth: 100,
  },
  countryFlag: {
    fontSize: 18,
    marginRight: 5,
  },
  dialCode: {
    fontSize: 16,
    color: '#333',
    marginRight: 5,
  },
  phoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 15,
    height: 55,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  genderContainer: {
    marginBottom: 30,
  },
  genderLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
    fontWeight: '600',
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 15,
    backgroundColor: '#F8F9FA',
  },
  genderButtonActive: {
    backgroundColor: '#FF6B35',
  },
  genderButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '500',
  },
  genderButtonTextActive: {
    color: '#fff',
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberMeText: {
    marginLeft: 8,
    fontSize: 15,
    color: '#333',
  },
  forgotPasswordText: {
    fontSize: 15,
    color: '#FF6B35',
    fontWeight: '500',
  },
  button: {
    width: '100%',
    height: 55,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#FF6B35',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  countryList: {
    maxHeight: height * 0.5,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  countryName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  countryCode: {
    fontSize: 16,
    color: '#666',
  },
  forgotPasswordForm: {
    padding: 20,
  },
});