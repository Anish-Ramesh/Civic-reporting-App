import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.civicmitra.app',
  appName: 'Civic Mitra',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      androidScaleType: 'CENTER_CROP',
      backgroundColor: '#ffffff',
      showSpinner: false
    },
    StatusBar: {
      backgroundColor: '#ffffff',
      style: 'LIGHT'
    }
  },
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
