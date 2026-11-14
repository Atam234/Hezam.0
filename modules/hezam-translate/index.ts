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

export interface HezamPhoneNative {
  isControlEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<boolean>;
  listApps(): Promise<string[]>;
  openApp(name: string): Promise<string>;
  openUrl(url: string): Promise<boolean>;
  /** The current screen as a numbered list of elements. */
  readScreen(): Promise<string>;
  tap(index: number): Promise<boolean>;
  typeText(index: number, text: string): Promise<boolean>;
  scroll(direction: string): Promise<boolean>;
  pressButton(button: string): Promise<boolean>;
}

/** Null on platforms without the native module (iOS, web). */
export const HezamPhone = requireOptionalNativeModule<HezamPhoneNative>('HezamPhone');
