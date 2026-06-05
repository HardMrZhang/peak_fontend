import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'org.peaknode.peak',
  appName: 'PEAK',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#000000',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: [
      'peak.peaknode.org',
      '*.peaknode.org',
      'mainnet.helius-rpc.com',
    ],
  },
}

export default config
