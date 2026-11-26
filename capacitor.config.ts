import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'edu.uam.avisia',
  appName: 'AVISIA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
