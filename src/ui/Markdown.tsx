import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, mono } from '../theme';

type Block =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; marker: string; text: string }
  | { kind: 'para'; text: string };

/** Small Markdown subset: fenced code, headings, lists, bold, italic, inline code. */
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join('\n') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      // An unclosed fence (still streaming) runs to the end of the text.
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      blocks.push({ kind: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', marker: /\d/.test(bullet[1]) ? bullet[1] : '•', text: bullet[2] });
      continue;
    }
    if (line.trim() === '') flush();
    else para.push(line);
  }
  flush();
  return blocks;
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g);
  return parts.map((part, i) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text key={i} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={i} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return (
        <Text key={i} style={styles.italic}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={styles.code}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{lang || 'code'}</Text>
        <Pressable onPress={copy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy code">
          <Text style={styles.codeCopy}>{copied ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeText} selectable>
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <View style={styles.root}>
      {parseBlocks(children).map((b, i) => {
        switch (b.kind) {
          case 'code':
            return <CodeBlock key={i} lang={b.lang} text={b.text} />;
          case 'heading':
            return (
              <Text key={i} style={[styles.text, styles.heading, b.level <= 2 && styles.headingLarge]} selectable>
                {inline(b.text)}
              </Text>
            );
          case 'bullet':
            return (
              <View key={i} style={styles.bulletRow}>
                <Text style={[styles.text, styles.bulletMarker]}>{b.marker}</Text>
                <Text style={[styles.text, styles.bulletText]} selectable>
                  {inline(b.text)}
                </Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={styles.text} selectable>
                {inline(b.text)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  heading: { fontWeight: '700', fontSize: 17, marginTop: 4 },
  headingLarge: { fontSize: 20, lineHeight: 28 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bulletMarker: { color: colors.textDim, minWidth: 14 },
  bulletText: { flex: 1 },
  inlineCode: {
    fontFamily: mono,
    fontSize: 14,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
  },
  code: {
    backgroundColor: colors.codeBg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceHigh,
  },
  codeLang: { color: colors.textDim, fontSize: 12, fontFamily: mono },
  codeCopy: { color: colors.textDim, fontSize: 12 },
  codeText: { color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 20, padding: 12 },
});
