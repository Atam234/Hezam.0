import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Lang } from '../router/language';
import { colors } from '../theme';
import { completeSentences, speakable, speechLocale } from '../voice/speech';

export interface VoiceAnswer {
  text: string;
  lang: Lang;
  /** Set when the model could not answer. */
  error?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Language the microphone listens for. */
  voiceLanguage: Lang;
  /**
   * Sends what the user said to the assistant. `onPartial` receives the answer as it is
   * being written, so speech can start before the answer is finished.
   */
  onAsk: (text: string, onPartial: (answer: string, lang: Lang) => void) => Promise<VoiceAnswer | null>;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

const LABEL: Record<Phase, string> = {
  idle: 'Tap to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
  error: 'Tap to try again',
};

const ORB_COLOR: Record<Phase, string> = {
  idle: '#3F3F46',
  listening: '#FFFFFF',
  thinking: '#FBBF24',
  speaking: '#34D399',
  error: '#F87171',
};

/** Hands-free conversation: listen, answer with the local model, read the answer aloud, repeat. */
export function VoiceSheet({ visible, onClose, voiceLanguage, onAsk }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const phaseRef = useRef<Phase>('idle');
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;
  /** Bumped whenever the current turn is abandoned, so late callbacks from it are ignored. */
  const turn = useRef(0);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      go('error');
    },
    [go],
  );

  const listen = useCallback(() => {
    if (restart.current) clearTimeout(restart.current);
    restart.current = null;
    if (!visibleRef.current) return;
    setError('');
    setHeard('');
    go('listening');
    try {
      ExpoSpeechRecognitionModule.start({
        lang: speechLocale(voiceLanguage),
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [fail, go, voiceLanguage]);

  /** Listen again shortly; safe to call from several events of the same recognition session. */
  const listenSoon = useCallback(() => {
    if (restart.current) return;
    restart.current = setTimeout(() => {
      restart.current = null;
      if (visibleRef.current && phaseRef.current === 'listening') listen();
    }, 500);
  }, [listen]);

  const ask = useCallback(
    async (text: string) => {
      const id = ++turn.current;
      const current = () => id === turn.current && visibleRef.current;
      go('thinking');
      setReply('');

      let spokenLength = 0;
      let spokenAny = false;
      const say = (chunk: string, lang: Lang, onDone?: () => void) => {
        if (!current()) return;
        if (phaseRef.current !== 'speaking') go('speaking');
        spokenAny = true;
        Speech.speak(chunk, { language: speechLocale(lang), onDone, onError: onDone });
      };

      const answer = await onAskRef.current(text, (partial, lang) => {
        if (!current()) return;
        const plain = speakable(partial);
        setReply(plain);
        const next = completeSentences(plain, spokenLength);
        if (next.sentences) {
          spokenLength = next.nextLength;
          say(next.sentences, lang);
        }
      });
      if (!current()) return;
      if (!answer) return fail('No AI model is installed yet. Close voice mode and download one in Models.');
      if (answer.error) return fail(answer.error);

      const plain = speakable(answer.text);
      setReply(plain);
      const finish = () => {
        if (current()) listen();
      };
      // The final answer can differ from what was streamed (for example after translation).
      const remainder = spokenAny && plain.length >= spokenLength ? plain.slice(spokenLength).trim() : plain;
      if (remainder) {
        say(remainder, answer.lang, finish);
      } else {
        // Everything was already queued; wait for the voice to finish before listening again.
        const wait = async () => {
          while (current() && (await Speech.isSpeakingAsync())) await new Promise((r) => setTimeout(r, 250));
          finish();
        };
        wait();
      }
    },
    [fail, go, listen],
  );

  useSpeechRecognitionEvent('result', (event) => {
    if (phaseRef.current !== 'listening') return;
    const transcript = event.results[0]?.transcript ?? '';
    setHeard(transcript);
    if (event.isFinal && transcript.trim()) ask(transcript.trim());
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (phaseRef.current !== 'listening' || event.error === 'aborted') return;
    // Silence is normal in a hands-free conversation: just keep listening.
    if (event.error === 'no-speech' || event.error === 'speech-timeout') return listenSoon();
    if (event.error === 'not-allowed') return fail('Microphone permission is needed for voice mode.');
    if (event.error === 'language-not-supported') {
      return fail('This phone has no speech recognition for that language. Change Voice language in Settings.');
    }
    fail(event.message || `Speech recognition error: ${event.error}`);
  });

  useSpeechRecognitionEvent('end', () => {
    // Recognition stopped without hearing a full sentence: start it again.
    if (phaseRef.current === 'listening') listenSoon();
  });

  const stopAll = useCallback(() => {
    turn.current++;
    if (restart.current) clearTimeout(restart.current);
    restart.current = null;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // not running
    }
    Speech.stop().catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) {
      stopAll();
      go('idle');
      return;
    }
    let cancelled = false;
    setHeard('');
    setReply('');
    (async () => {
      try {
        if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
          return fail(
            'Speech recognition is not available on this phone. Install or enable "Speech Recognition & Synthesis" by Google.',
          );
        }
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) return fail('Microphone permission is needed for voice mode.');
        listen();
      } catch (e) {
        if (!cancelled) fail(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
    // Runs only when the sheet opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onOrb = () => {
    if (phase === 'thinking') return;
    if (phase === 'listening') {
      stopAll();
      go('idle');
      return;
    }
    stopAll(); // interrupts speech
    listen();
  };

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'speaking' && phase !== 'thinking') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice</Text>
          <Text style={styles.sub}>Listening in {voiceLanguage === 'tl' ? 'Tagalog' : 'English'}</Text>
        </View>

        <ScrollView style={styles.textArea} contentContainerStyle={styles.textContent}>
          {heard ? <Text style={styles.heard}>{heard}</Text> : null}
          {reply ? <Text style={styles.reply}>{reply}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.center}>
          <Pressable onPress={onOrb} accessibilityRole="button" accessibilityLabel={LABEL[phase]}>
            <Animated.View style={[styles.orb, { backgroundColor: ORB_COLOR[phase], transform: [{ scale }] }]} />
          </Pressable>
          <Text style={styles.phase}>{LABEL[phase]}</Text>
        </View>

        <Pressable style={styles.end} onPress={onClose} accessibilityRole="button">
          <Text style={styles.endText}>End</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingBottom: 16 },
  header: { alignItems: 'center', paddingTop: 14, gap: 2 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sub: { color: colors.textFaint, fontSize: 12 },
  textArea: { flex: 1, marginTop: 16 },
  textContent: { gap: 14, paddingBottom: 8 },
  heard: { color: colors.textDim, fontSize: 18, lineHeight: 26, textAlign: 'right' },
  reply: { color: colors.text, fontSize: 20, lineHeight: 29 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  center: { alignItems: 'center', gap: 18, paddingVertical: 24 },
  orb: { width: 132, height: 132, borderRadius: 66 },
  phase: { color: colors.textDim, fontSize: 15 },
  end: {
    alignSelf: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 36,
    paddingVertical: 12,
  },
  endText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
