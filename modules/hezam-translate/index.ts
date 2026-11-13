import { requireOptionalNativeModule } from 'expo';

export interface HezamTranslateNative {
  isModelDownloaded(language: string): Promise<boolean>;
  downloadModel(language: string): Promise<boolean>;
  translate(text: string, source: string, target: string): Promise<string>;
}

/** Null on platforms without the native module (iOS, web). */
export default requireOptionalNativeModule<HezamTranslateNative>('HezamTranslate');
