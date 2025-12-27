import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthModal from './src/components/AuthModal';
import TabNavigator from './src/navigation/TabNavigator';

function AppContent() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4ECDC4' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  
  return user ? (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  ) : (
    <AuthModal />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}