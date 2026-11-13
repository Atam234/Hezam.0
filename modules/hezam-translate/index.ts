import { requireOptionalNativeModule } from 'expo';

export interface HezamTranslateNative {
  isModelDownloaded(language: string): Promise<boolean>;
  downloadModel(language: string): Promise<boolean>;
  translate(text: string, source: string, target: string): Promise<string>;
}

/** Null on platforms without the native module (iOS, web). */
export default requireOptionalNativeModule<HezamTranslateNative>('HezamTranslate');

export interface HezamFilesNative {
  /** Streams a picked content:// file into app storage; resolves with its size in bytes. */
  importGguf(fromUri: string, toFileUri: string): Promise<number>;
}

/** Null on platforms without the native module (iOS, web). */
export const HezamFiles = requireOptionalNativeModule<HezamFilesNative>('HezamFiles');
