import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const signIn = async (email, password) => {
    setIsLoading(true);
    // TODO: Replace with Firebase auth
    // For now, simulate login
    await new Promise(resolve => setTimeout(resolve, 1000));
    setUser({ email });
    setIsLoading(false);
  };

  const signUp = async (email, password) => {
    setIsLoading(true);
    // TODO: Replace with Firebase auth
    await new Promise(resolve => setTimeout(resolve, 1000));
    setUser({ email });
    setIsLoading(false);
  };

  const signOut = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);