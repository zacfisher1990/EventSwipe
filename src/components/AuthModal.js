import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  Linking,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import i18n from '../i18n';

const { width, height } = Dimensions.get('window');

// Floating event icons that drift across the background
const FloatingIcon = ({ icon, delay, duration, startX, startY }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0.6,
        duration: 1000,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(translateY, {
              toValue: -30,
              duration: duration,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 30,
              duration: duration,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(translateX, {
              toValue: 15,
              duration: duration * 0.7,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: -15,
              duration: duration * 0.7,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rotate, {
              toValue: 1,
              duration: duration * 1.5,
              useNativeDriver: true,
            }),
            Animated.timing(rotate, {
              toValue: 0,
              duration: duration * 1.5,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '10deg'],
  });

  return (
    <Animated.Text
      style={[
        styles.floatingIcon,
        {
          left: startX,
          top: startY,
          opacity,
          transform: [
            { translateY },
            { translateX },
            { rotate: rotateInterpolate },
          ],
        },
      ]}
    >
      {icon}
    </Animated.Text>
  );
};

// Animated gradient orbs in background
const GradientOrb = ({ color, size, x, y, delay }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.3,
              duration: 4000,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 4000,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.5,
              duration: 3000,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.3,
              duration: 3000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.gradientOrb,
        {
          backgroundColor: color,
          width: size,
          height: size,
          borderRadius: size / 2,
          left: x,
          top: y,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
};

export default function AuthModal() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  
  const { signIn, signUp } = useAuth();

  // Animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(50)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // Entrance animations
  useEffect(() => {
    Animated.spring(logoScale, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: -1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.parallel([
      Animated.spring(cardTranslateY, {
        toValue: 0,
        tension: 50,
        friction: 8,
        delay: 300,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 600,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Shake animation for errors
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    setError('');
    
    if (!email || !password) {
      setError(i18n.t('auth.fillAllFields'));
      triggerShake();
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError(i18n.t('auth.passwordMismatch'));
      triggerShake();
      return;
    }

    if (password.length < 6) {
      setError(i18n.t('auth.weakPassword'));
      triggerShake();
      return;
    }

    setLoading(true);
    
    try {
      let result;
      if (isLogin) {
        result = await signIn(email, password);
      } else {
        result = await signUp(email, password);
      }
      
      if (!result.success) {
        setError(result.error);
        triggerShake();
      }
    } catch (err) {
      setError(err.message || i18n.t('errors.generic'));
      triggerShake();
    }
    
    setLoading(false);
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-2deg', '0deg', '2deg'],
  });

  const floatingIcons = [
    { icon: '🎵', delay: 0, duration: 3000, startX: width * 0.1, startY: height * 0.08 },
    { icon: '🎨', delay: 500, duration: 3500, startX: width * 0.75, startY: height * 0.12 },
    { icon: '🎭', delay: 1000, duration: 2800, startX: width * 0.15, startY: height * 0.22 },
    { icon: '🍕', delay: 1500, duration: 3200, startX: width * 0.8, startY: height * 0.28 },
    { icon: '🎪', delay: 800, duration: 3100, startX: width * 0.05, startY: height * 0.35 },
    { icon: '🎤', delay: 1200, duration: 2900, startX: width * 0.85, startY: height * 0.05 },
    { icon: '🎬', delay: 200, duration: 3300, startX: width * 0.6, startY: height * 0.02 },
    { icon: '🏃', delay: 700, duration: 3400, startX: width * 0.25, startY: height * 0.15 },
  ];

  return (
    <View style={styles.container}>
      {/* Animated background orbs */}
      <GradientOrb color="#7EDDD6" size={200} x={-50} y={-50} delay={0} />
      <GradientOrb color="#3BA99F" size={250} x={width - 100} y={height * 0.3} delay={500} />
      <GradientOrb color="#A8E6CF" size={180} x={width * 0.3} y={height * 0.15} delay={1000} />
      <GradientOrb color="#5DBDAD" size={220} x={-80} y={height * 0.4} delay={750} />

      {/* Floating event icons */}
      {floatingIcons.map((props, index) => (
        <FloatingIcon key={index} {...props} />
      ))}

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Animated logo */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                transform: [
                  { scale: logoScale },
                  { rotate: logoRotateInterpolate },
                ],
              },
            ]}
          >
            <Text style={styles.logo}>EventSwipe</Text>
            <Text style={styles.tagline}>{i18n.t('auth.tagline')}</Text>
            
            {/* Swipe hint cards */}
            <View style={styles.swipeHint}>
              <View style={[styles.miniCard, styles.miniCardLeft]} />
              <View style={[styles.miniCard, styles.miniCardCenter]} />
              <View style={[styles.miniCard, styles.miniCardRight]} />
            </View>
          </Animated.View>

          {/* Animated form card */}
          <Animated.View
            style={[
              styles.form,
              {
                opacity: cardOpacity,
                transform: [
                  { translateY: cardTranslateY },
                  { translateX: shakeAnimation },
                ],
              },
            ]}
          >
            <Text style={styles.title}>{isLogin ? i18n.t('auth.welcomeBack') : i18n.t('auth.createAccount')}</Text>
            <Text style={styles.subtitle}>
              {isLogin ? i18n.t('auth.readyForAdventure') : i18n.t('auth.joinTheFun')}
            </Text>

            <View
              style={[
                styles.inputContainer,
                focusedInput === 'email' && styles.inputFocused,
              ]}
            >
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.t('auth.email')}
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('email')}
                onBlur={() => setFocusedInput(null)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View
              style={[
                styles.inputContainer,
                focusedInput === 'password' && styles.inputFocused,
              ]}
            >
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.t('auth.password')}
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry
              />
            </View>

            {!isLogin && (
              <View
                style={[
                  styles.inputContainer,
                  focusedInput === 'confirm' && styles.inputFocused,
                ]}
              >
                <Text style={styles.inputIcon}>🔐</Text>
                <TextInput
                  style={styles.input}
                  placeholder={i18n.t('auth.confirmPassword')}
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedInput('confirm')}
                  onBlur={() => setFocusedInput(null)}
                  secureTextEntry
                />
              </View>
            )}

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity 
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Animated.View
                style={[
                  styles.button,
                  { transform: [{ scale: buttonScale }] },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {isLogin ? i18n.t('auth.letsGo') : i18n.t('auth.joinTheParty')}
                  </Text>
                )}
              </Animated.View>
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleMode} style={styles.toggleButton}>
              <Text style={styles.toggleText}>
                {isLogin 
                  ? `${i18n.t('auth.noAccount')} ` 
                  : `${i18n.t('auth.haveAccount')} `}
                <Text style={styles.toggleTextBold}>
                  {isLogin ? i18n.t('auth.signUp') : i18n.t('auth.signIn')}
                </Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legalContainer}>
              <Text style={styles.legalText}>
                {i18n.t('auth.byContinuing')}{' '}
                <Text 
                  style={styles.legalLink} 
                  onPress={() => Linking.openURL('https://eventswipeapp.com/#terms')}
                >
                  {i18n.t('auth.termsOfService')}
                </Text>
                {' '}{i18n.t('auth.and')}{' '}
                <Text 
                  style={styles.legalLink} 
                  onPress={() => Linking.openURL('https://eventswipeapp.com/#privacy')}
                >
                  {i18n.t('auth.privacyPolicy')}
                </Text>
              </Text>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    overflow: 'hidden',
  },
  gradientOrb: {
    position: 'absolute',
  },
  floatingIcon: {
    position: 'absolute',
    fontSize: 32,
    zIndex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
  fontSize: 42,
  fontFamily: 'Shrikhand_400Regular',
  color: '#fff',
  textAlign: 'center',
  textShadowColor: 'rgba(0, 0, 0, 0.15)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 4,
},
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  swipeHint: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  miniCard: {
    width: 40,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 8,
    position: 'absolute',
  },
  miniCardLeft: {
    transform: [{ rotate: '-15deg' }, { translateX: -30 }],
    opacity: 0.5,
  },
  miniCardCenter: {
    transform: [{ rotate: '0deg' }],
    opacity: 0.8,
    zIndex: 2,
  },
  miniCardRight: {
    transform: [{ rotate: '15deg' }, { translateX: 30 }],
    opacity: 0.5,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: '#4ECDC4',
    backgroundColor: '#f0fffe',
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#888',
    fontSize: 14,
  },
  toggleTextBold: {
    color: '#4ECDC4',
    fontWeight: '700',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#FFF0F0',
    padding: 10,
    borderRadius: 8,
  },
  errorIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  error: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  legalContainer: {
    marginTop: 16,
    paddingHorizontal: 10,
  },
  legalText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
});