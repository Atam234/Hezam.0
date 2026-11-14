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
  /** Taps the element showing these words; resolves with its label. */
  tapText(text: string): Promise<string>;
  /** Types into the focused or first text box: 'no-input' | 'typed' | 'submitted' | 'typed-not-submitted'. */
  typeAuto(text: string, submit: boolean): Promise<string>;
  pressEnter(): Promise<boolean>;
  /** Taps the current app's search icon or field. */
  tapSearch(): Promise<boolean>;
  /** Taps the first search result that mentions the query; resolves with its label. */
  tapFirstResult(query: string): Promise<string>;
  /** Asks a music app (optionally a named one) to find and play something. */
  playFromSearch(query: string, app: string): Promise<boolean>;
}

/** Null on platforms without the native module (iOS, web). */
export const HezamPhone = requireOptionalNativeModule<HezamPhoneNative>('HezamPhone');
