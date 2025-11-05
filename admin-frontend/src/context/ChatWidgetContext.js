// src/context/ChatWidgetContext.js

import React, { createContext, useContext, useState } from 'react';

const ChatWidgetContext = createContext();

export const useChatWidget = () => {
  const context = useContext(ChatWidgetContext);
  if (!context) {
    throw new Error('useChatWidget must be used within ChatWidgetProvider');
  }
  return context;
};

export const ChatWidgetProvider = ({ children }) => {
  const [isWidgetActive, setIsWidgetActive] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  const activateWidget = () => {
    setIsWidgetActive(true);
    setIsWidgetOpen(true);
  };

  const closeWidget = () => {
    setIsWidgetOpen(false);
  };

  const openWidget = () => {
    setIsWidgetOpen(true);
  };

  const toggleWidget = () => {
    setIsWidgetOpen(prev => !prev);
  };

  return (
    <ChatWidgetContext.Provider
      value={{
        isWidgetActive,
        isWidgetOpen,
        activateWidget,
        closeWidget,
        openWidget,
        toggleWidget,
      }}
    >
      {children}
    </ChatWidgetContext.Provider>
  );
};
