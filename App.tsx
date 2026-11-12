import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import * as engine from './src/engine/engine';
import { splitThinking, type ChatTurn } from './src/engine/types';
import { getModel, MODELS, SPECIALIST_ORDER, SPECIALISTS, type ModelInfo } from './src/models/catalog';
import { classify, pickModel, type SpecialistId } from './src/router/router';
import {
  loadConversations,
  newId,
  saveConversations,
  titleFrom,
  type Conversation,
  type Message,
} from './src/storage/chats';
import * as downloads from './src/storage/downloads';
import { colors } from './src/theme';
import { HistorySheet } from './src/ui/HistorySheet';
import { MessageView } from './src/ui/MessageView';
import { ModelsSheet } from './src/ui/ModelsSheet';

type Mode = 'auto' | SpecialistId;

const MAX_REPLY_TOKENS = 1024;
/** Rough character budget of chat history sent to the model (context is 4096 tokens). */
const HISTORY_CHAR_BUDGET = 6000;
const KEEP_AWAKE_TAG = 'hezam-download';

const SUGGESTIONS: { specialist: SpecialistId; text: string }[] = [
  { specialist: 'code', text: 'Write a Python script that renames many files at once' },
  { specialist: 'writing', text: 'Write a thank-you letter to my teacher' },
  { specialist: 'creative', text: 'Brainstorm logo ideas for a coffee shop' },
  { specialist: 'reasoning', text: 'What is 15 percent of 2,500? Show the steps' },
];

function buildTurns(systemPrompt: string, history: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.error) continue;
    const content = m.role === 'assistant' ? splitThinking(m.content).answer : m.content;
    if (!content) continue;
    // Always keep the newest message; drop older ones once the budget is spent.
    if (turns.length > 0 && used + content.length > HISTORY_CHAR_BUDGET) break;
    used += content.length;
    turns.unshift({ role: m.role, content });
  }
  return [{ role: 'system', content: systemPrompt }, ...turns];
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Chat />
    </SafeAreaProvider>
  );
}

function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatId, setChatId] = useState(newId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('auto');

  const [installed, setInstalled] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [freeBytes, setFreeBytes] = useState(0);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [showModels, setShowModels] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const followRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const refreshStorage = useCallback(async () => {
    setInstalled(new Set(await downloads.listInstalled()));
    setFreeBytes(await downloads.freeSpaceBytes().catch(() => 0));
  }, []);

  useEffect(() => {
    loadConversations().then(setConversations);
    refreshStorage();
    return () => {
      engine.unload().catch(() => {});
    };
  }, [refreshStorage]);

  const persist = useCallback((id: string, msgs: Message[]) => {
    const firstUser = msgs.find((m) => m.role === 'user');
    const others = conversationsRef.current.filter((c) => c.id !== id);
    const next: Conversation[] = [
      { id, title: titleFrom(firstUser?.content ?? ''), updatedAt: Date.now(), messages: msgs },
      ...others,
    ];
    setConversations(next);
    saveConversations(next).catch(() => {});
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || generating) return;
      if (installed.size === 0) {
        setShowModels(true);
        return;
      }

      const history = messagesRef.current;
      const previous = [...history].reverse().find((m) => m.role === 'assistant')?.specialist;
      const manual = mode !== 'auto';
      const decision = manual ? null : classify(text, previous);
      const specialistId: SpecialistId = manual ? mode : decision!.specialist;
      const pick = pickModel(specialistId, MODELS, installed);
      if (!pick) {
        setShowModels(true);
        return;
      }
      const specialist = SPECIALISTS[specialistId];

      const userMessage: Message = { id: newId(), role: 'user', content: text };
      const reply: Message = {
        id: newId(),
        role: 'assistant',
        content: '',
        specialist: specialistId,
        modelId: pick.model.id,
        matched: decision?.matched,
        fallback: pick.fallback,
        manual,
      };
      const base = [...history, userMessage];
      setMessages([...base, reply]);
      setInput('');
      setGenerating(true);
      followRef.current = true;

      let final: Message = reply;
      try {
        if (engine.loadedModelId() !== pick.model.id) {
          setStatus(`Loading ${pick.model.name}…`);
          await engine.ensureLoaded(pick.model.id, downloads.modelPath(pick.model), (p) =>
            setStatus(`Loading ${pick.model.name}… ${Math.round(p * 100)}%`),
          );
          setLoadedId(pick.model.id);
        }
        setStatus('Answering…');

        let lastPaint = 0;
        const result = await engine.generate(
          buildTurns(specialist.systemPrompt, base),
          { temperature: specialist.temperature, maxTokens: MAX_REPLY_TOKENS },
          (full) => {
            // Repainting on every token is wasteful; ~12 updates a second reads as smooth.
            const now = Date.now();
            if (now - lastPaint < 80) return;
            lastPaint = now;
            patchMessage(reply.id, { content: full });
          },
        );
        final = { ...reply, content: result.text.trim(), tokensPerSecond: result.tokensPerSecond };
        if (!splitThinking(final.content).answer) {
          final = { ...final, error: true, content: 'The model returned no answer. Please try again.' };
        }
      } catch (e) {
        setLoadedId(engine.loadedModelId());
        final = {
          ...reply,
          error: true,
          content: `${pick.model.name} could not answer: ${errorText(e)}\n\nIf the phone is low on RAM, try a smaller model.`,
        };
      } finally {
        const done = [...base, final];
        setMessages(done);
        setStatus('');
        setGenerating(false);
        persist(chatId, done);
      }
    },
    [chatId, generating, installed, mode, patchMessage, persist],
  );

  const newChat = useCallback(() => {
    if (generating) return;
    setChatId(newId());
    setMessages([]);
  }, [generating]);

  const openChat = useCallback(
    (id: string) => {
      if (generating) return;
      const c = conversationsRef.current.find((x) => x.id === id);
      if (!c) return;
      setChatId(c.id);
      setMessages(c.messages);
      setShowHistory(false);
    },
    [generating],
  );

  const deleteChat = useCallback(
    (id: string) => {
      const next = conversationsRef.current.filter((c) => c.id !== id);
      setConversations(next);
      saveConversations(next).catch(() => {});
      if (id === chatId && !generating) {
        setChatId(newId());
        setMessages([]);
      }
    },
    [chatId, generating],
  );

  const download = useCallback(
    async (m: ModelInfo) => {
      setProgress((p) => ({ ...p, [m.id]: 0 }));
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      try {
        await downloads.downloadModel(m, (f) => setProgress((p) => (m.id in p ? { ...p, [m.id]: f } : p)));
      } catch (e) {
        Alert.alert('Download failed', `${m.name}: ${errorText(e)}`);
      } finally {
        setProgress((p) => {
          const { [m.id]: _done, ...rest } = p;
          if (Object.keys(rest).length === 0) deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
          return rest;
        });
        refreshStorage();
      }
    },
    [refreshStorage],
  );

  const removeModel = useCallback(
    async (m: ModelInfo) => {
      if (engine.loadedModelId() === m.id) {
        await engine.unload();
        setLoadedId(null);
      }
      await downloads.deleteModel(m);
      refreshStorage();
    },
    [refreshStorage],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    followRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
  }, []);

  const lastId = messages[messages.length - 1]?.id;
  const loadedModel = loadedId ? getModel(loadedId) : undefined;
  const subtitle = useMemo(() => {
    if (engine.isDemo) return 'web preview · demo only';
    if (loadedModel) return `${loadedModel.name} · offline`;
    return installed.size ? 'offline · local AI' : 'no model yet';
  }, [installed.size, loadedModel]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setShowHistory(true)}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Chat history"
        >
          <Text style={styles.icon}>☰</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.brand}>
            Hezam<Text style={styles.brandDim}>.0</Text>
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowModels(true)}
          style={styles.modelsPill}
          accessibilityRole="button"
          accessibilityLabel="Manage AI models"
        >
          <Text style={styles.modelsPillText}>
            Models {installed.size}/{MODELS.length}
          </Text>
        </Pressable>
        <Pressable
          onPress={newChat}
          hitSlop={10}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <Text style={styles.icon}>＋</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        {messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.empty} keyboardShouldPersistTaps="handled">
            <Text style={styles.heroLogo}>
              Hezam<Text style={styles.brandDim}>.0</Text>
            </Text>
            <Text style={styles.heroTag}>
              One assistant, many experts.{'\n'}Automatically picks the right local AI model for every question.
            </Text>
            {installed.size === 0 ? (
              <Pressable style={styles.cta} onPress={() => setShowModels(true)} accessibilityRole="button">
                <Text style={styles.ctaTitle}>Download your first model</Text>
                <Text style={styles.ctaText}>You need at least one model to chat offline.</Text>
              </Pressable>
            ) : (
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => {
                  const spec = SPECIALISTS[s.specialist];
                  return (
                    <Pressable
                      key={s.text}
                      style={styles.suggestion}
                      onPress={() => send(s.text)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.suggestionKind, { color: spec.color }]}>
                        {spec.glyph} {spec.name}
                      </Text>
                      <Text style={styles.suggestionText}>{s.text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageView message={item} status={generating && item.id === lastId ? status : undefined} />
            )}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={64}
            onContentSizeChange={() => {
              if (followRef.current) listRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        <View style={styles.dock}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modes}
            keyboardShouldPersistTaps="handled"
          >
            <ModeChip label="◈ Auto" active={mode === 'auto'} color={colors.accent} onPress={() => setMode('auto')} />
            {SPECIALIST_ORDER.map((id) => (
              <ModeChip
                key={id}
                label={`${SPECIALISTS[id].glyph} ${SPECIALISTS[id].short}`}
                active={mode === id}
                color={SPECIALISTS[id].color}
                onPress={() => setMode(id)}
              />
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything…"
              placeholderTextColor={colors.textFaint}
              multiline
              accessibilityLabel="Message"
            />
            {generating ? (
              <Pressable
                style={styles.send}
                onPress={() => engine.stop().catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel="Stop"
              >
                <View style={styles.stopSquare} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.send, !input.trim() && styles.sendDisabled]}
                disabled={!input.trim()}
                onPress={() => send(input)}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendArrow}>↑</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <ModelsSheet
        visible={showModels}
        onClose={() => setShowModels(false)}
        installed={installed}
        progress={progress}
        loadedId={loadedId}
        freeBytes={freeBytes}
        busy={generating}
        onDownload={download}
        onCancel={(m) => downloads.cancelDownload(m)}
        onDelete={removeModel}
      />
      <HistorySheet
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        conversations={conversations}
        currentId={chatId}
        onOpen={openChat}
        onDelete={deleteChat}
      />
    </SafeAreaView>
  );
}

function ModeChip(props: { label: string; active: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.chip, props.active && { borderColor: props.color, backgroundColor: colors.surfaceHigh }]}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
    >
      <Text style={[styles.chipText, props.active && { color: props.color }]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.text, fontSize: 20 },
  headerCenter: { flex: 1, paddingLeft: 4 },
  brand: { color: colors.text, fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  brandDim: { color: colors.textFaint },
  subtitle: { color: colors.textFaint, fontSize: 12 },
  modelsPill: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modelsPillText: { color: colors.text, fontSize: 13, fontWeight: '600' },

  empty: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  heroLogo: { color: colors.text, fontSize: 44, fontWeight: '800', textAlign: 'center', letterSpacing: -1 },
  heroTag: { color: colors.textDim, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
  cta: { backgroundColor: colors.accent, borderRadius: 18, padding: 18, gap: 4 },
  ctaTitle: { color: colors.onAccent, fontSize: 17, fontWeight: '700' },
  ctaText: { color: '#3F3F46', fontSize: 14, lineHeight: 20 },
  suggestions: { gap: 10 },
  suggestion: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  suggestionKind: { fontSize: 12, fontWeight: '600' },
  suggestionText: { color: colors.text, fontSize: 15, lineHeight: 21 },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },

  dock: { paddingBottom: 8, gap: 8 },
  modes: { paddingHorizontal: 12, gap: 8 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 12,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 26,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 140,
    minHeight: 36,
    paddingTop: 7,
    paddingBottom: 7,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.3 },
  sendArrow: { color: colors.onAccent, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.onAccent },
});
