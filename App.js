import React from 'react';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthModal from './src/components/AuthModal';
import HomeScreen from './src/screens/HomeScreen';

function AppContent() {
  const { user } = useAuth();
  
  return user ? <HomeScreen /> : <AuthModal />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
