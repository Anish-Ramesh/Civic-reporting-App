import React from 'react';
import Navbar from './Navbar';
import ChatbotWidget from './ChatbotWidget';
import LanguageSwitcher from './LanguageSwitcher';
import GlobalGoLiveButton from './GlobalGoLiveButton.jsx';

const Layout = ({ children, showBottomNav = true }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 overflow-auto pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      {/* Bottom navigation removed */}
      {/* Mobile language switcher (FAB), hidden on desktop via component styles */}
      <LanguageSwitcher />
      <ChatbotWidget />
      {/* Global Go Live floating button */}
      <GlobalGoLiveButton />
    </div>
  );
};

export default Layout;
