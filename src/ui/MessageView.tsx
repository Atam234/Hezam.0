import * as Clipboard from 'expo-clipboard';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { splitThinking } from '../engine/types';
import { getModel, SPECIALISTS } from '../models/catalog';
import type { Message } from '../storage/chats';
import { colors } from '../theme';
import { Markdown } from './Markdown';

interface Props {
  message: Message;
  /** Status line shown while this message is still being produced. */
  status?: string;
}

export const MessageView = memo(function MessageView({ message, status }: Props) {
  const [copied, setCopied] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  const specialist = SPECIALISTS[message.specialist ?? 'general'];
  const model = message.modelId ? getModel(message.modelId) : undefined;
  const split = splitThinking(message.content);
  const thinking = split.thinking;
  const answer = showOriginal && message.original ? message.original : split.answer;
  const translator = message.translatorId ? getModel(message.translatorId) : undefined;
  const agent = message.agentSteps !== undefined;
  const why = message.manual
    ? 'you chose this'
    : message.matched?.length
      ? message.matched.slice(0, 2).join(', ')
      : 'general question';

  const copy = async () => {
    await Clipboard.setStringAsync(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.assistant}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { borderColor: agent ? AGENT_COLOR : specialist.color }]}>
          <Text style={[styles.badgeGlyph, { color: agent ? AGENT_COLOR : specialist.color }]}>
            {agent ? '⚡' : specialist.glyph}
          </Text>
          <Text style={[styles.badgeText, { color: agent ? AGENT_COLOR : specialist.color }]}>
            {agent ? 'Agent' : specialist.name}
          </Text>
        </View>
        {model && (
          <Text style={styles.modelName} numberOfLines={1}>
            {model.name}
          </Text>
        )}
      </View>
      {agent ? (
        <View style={styles.steps}>
          <Text style={styles.why}>
            {message.agentBrain === 'direct'
              ? 'Did it directly'
              : message.agentBrain === 'api'
                ? 'Agent · AI API'
                : 'Agent · local model'}
          </Text>
          {message.agentSteps!.map((s, i) => (
            <Text key={i} style={styles.step} numberOfLines={2}>
              <Text style={s.failed ? styles.stepFailed : styles.stepOk}>{s.failed ? '✕' : '✓'}</Text> {s.tool}
              {s.summary ? ` — ${s.summary}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={[styles.why, agent && styles.hidden]}>
        Auto-route: {why}
        {message.fallback ? ' · stand-in model (specialist not installed)' : ''}
        {message.translatedTo
          ? ` · translated to ${message.translatedTo === 'tl' ? 'Tagalog' : 'English'}${message.translatorId === 'google' ? ' by Google Translate (on-device)' : translator ? ` by ${translator.name}` : ''}`
          : ''}
      </Text>

      {message.error ? (
        <Text style={styles.error}>{message.content}</Text>
      ) : answer ? (
        <Markdown>{answer}</Markdown>
      ) : null}

      {status || thinking ? (
        <Text style={styles.status}>{thinking ? 'Thinking…' : status}</Text>
      ) : !message.error && answer ? (
        <View style={styles.footer}>
          <Pressable onPress={copy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy answer">
            <Text style={styles.footerText}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </Pressable>
          {message.original ? (
            <Pressable onPress={() => setShowOriginal((v) => !v)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.footerText}>{showOriginal ? 'Show translation' : 'Show original'}</Text>
            </Pressable>
          ) : null}
          {message.tokensPerSecond ? (
            <Text style={styles.footerText}>{message.tokensPerSecond.toFixed(1)} tok/s · offline</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const AGENT_COLOR = '#A78BFA';

const styles = StyleSheet.create({
  steps: { gap: 3 },
  step: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  stepOk: { color: '#34D399' },
  stepFailed: { color: colors.danger },
  hidden: { display: 'none' },
  userRow: { alignItems: 'flex-end', marginVertical: 8 },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  assistant: { marginVertical: 12, gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeGlyph: { fontSize: 13 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  modelName: { color: colors.textDim, fontSize: 12, flexShrink: 1 },
  why: { color: colors.textFaint, fontSize: 12, marginTop: -2 },
  status: { color: colors.textDim, fontSize: 14, fontStyle: 'italic' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  footer: { flexDirection: 'row', gap: 16, marginTop: 2 },
  footerText: { color: colors.textFaint, fontSize: 12 },
});
