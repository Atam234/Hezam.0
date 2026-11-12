import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Conversation } from '../storage/chats';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function HistorySheet({ visible, onClose, conversations, currentId, onOpen, onDelete }: Props) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Mga Chat</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Tapos</Text>
          </Pressable>
        </View>
        <FlatList
          data={sorted}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Wala pang naka-save na chat.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.row, item.id === currentId && styles.rowActive]}>
              <Pressable style={styles.rowMain} onPress={() => onOpen(item.id)} accessibilityRole="button">
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(item.updatedAt).toLocaleDateString()} · {item.messages.length} mensahe
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onDelete(item.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete chat"
              >
                <Text style={styles.delete}>Burahin</Text>
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  close: { color: colors.text, fontSize: 16, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 48, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 14,
  },
  rowActive: { backgroundColor: colors.surface },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowMeta: { color: colors.textFaint, fontSize: 12 },
  delete: { color: colors.danger, fontSize: 13 },
});
