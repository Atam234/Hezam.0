import { Platform } from 'react-native';

export const colors = {
  bg: '#000000',
  surface: '#0E0E10',
  surfaceHigh: '#18181B',
  border: '#26262B',
  text: '#F4F4F5',
  textDim: '#A1A1AA',
  textFaint: '#63636B',
  accent: '#FFFFFF',
  onAccent: '#000000',
  danger: '#F87171',
  codeBg: '#0B0B0D',
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
