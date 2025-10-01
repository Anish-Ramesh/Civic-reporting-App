import React from 'react';

const SafeAreaProvider = ({ children }) => {
  return (
    <div className="safe-area">
      {children}
    </div>
  );
};

export default SafeAreaProvider;
