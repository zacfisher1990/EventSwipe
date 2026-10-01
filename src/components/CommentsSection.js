import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  MAX_COMMENT_LENGTH,
  MAX_NAME_LENGTH,
  blockUser,
  commentKeyFor,
  deleteComment,
  fetchComments,
  postComment,
  reportComment,
  saveDisplayName,
} from '../services/commentService';
import i18n from '../i18n';

const formatTime = (date) => {
  if (Date.now() - date.getTime() < 60 * 1000) return i18n.t('comments.justNow');
  try {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return date.toDateString();
  }
};

const errorText = (reason) => {
  if (reason === 'language') return i18n.t('comments.notAllowed');
  if (reason === 'link') return i18n.t('comments.noLinks');
  if (reason === 'length') return i18n.t('comments.nameInvalid');
  return i18n.t('comments.postFailed');
};

/**
 * Comments for one event, shown inside the event details sheet.
 *   onRequireAccount — a guest tapped "Sign in to comment" (the parent closes
 *                      the sheet first; two modals can't be open at once on iOS)
 *   onInputFocus     — lets the parent scroll the input above the keyboard
 */
export default function CommentsSection({ event, onRequireAccount, onInputFocus }) {
  const { user, updateUserProfile } = useAuth();
  const eventKey = useMemo(() => commentKeyFor(event), [event]);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [nameText, setNameText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setComments([]);
    fetchComments(eventKey)
      .then((list) => { if (!cancelled) setComments(list); })
      .catch((e) => console.log('Could not load comments:', e?.code))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventKey]);

  const blocked = user?.blockedUsers || [];
  const visible = comments.filter((c) => !blocked.includes(c.authorId));

  const handleSaveName = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const displayName = await saveDisplayName(user.uid, nameText);
      updateUserProfile({ displayName });
    } catch (e) {
      setError(errorText(e.reason));
    }
    setBusy(false);
  };

  const handlePost = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const comment = await postComment(event, user, text);
      setComments((prev) => [comment, ...prev]);
      setText('');
    } catch (e) {
      setError(errorText(e.reason));
    }
    setBusy(false);
  };

  const handleDelete = useCallback((comment) => {
    Alert.alert(i18n.t('comments.deleteConfirm'), undefined, [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          await deleteComment(comment.id).catch(() => {});
        },
      },
    ]);
  }, []);

  const handleReport = useCallback((comment) => {
    Alert.alert(i18n.t('comments.report'), i18n.t('comments.reportConfirm'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('comments.report'),
        style: 'destructive',
        onPress: async () => {
          // Hide it for the reporter straight away
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          await reportComment(comment.id, user.uid).catch(() => {});
          Alert.alert(i18n.t('comments.reported'));
        },
      },
    ]);
  }, [user?.uid]);

  const handleBlock = useCallback((comment) => {
    Alert.alert(
      i18n.t('comments.block'),
      i18n.t('comments.blockConfirm', { name: comment.authorName }),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('comments.block'),
          style: 'destructive',
          onPress: async () => {
            updateUserProfile({ blockedUsers: [...blocked, comment.authorId] });
            await blockUser(user.uid, comment.authorId).catch(() => {});
          },
        },
      ]
    );
  }, [user?.uid, blocked, updateUserProfile]);

  const openMenu = (comment) => {
    if (comment.authorId === user?.uid) {
      handleDelete(comment);
      return;
    }
    Alert.alert(comment.authorName, undefined, [
      { text: i18n.t('comments.report'), onPress: () => handleReport(comment) },
      { text: i18n.t('comments.block'), style: 'destructive', onPress: () => handleBlock(comment) },
      { text: i18n.t('common.cancel'), style: 'cancel' },
    ]);
  };

  const renderComposer = () => {
    if (!user || user.isAnonymous) {
      return (
        <TouchableOpacity style={styles.signInButton} onPress={onRequireAccount}>
          <Ionicons name="chatbubble-outline" size={18} color="#4ECDC4" />
          <Text style={styles.signInText}>{i18n.t('comments.signInToComment')}</Text>
        </TouchableOpacity>
      );
    }

    if (!user.displayName) {
      return (
        <View>
          <Text style={styles.nameTitle}>{i18n.t('comments.chooseName')}</Text>
          <Text style={styles.nameHint}>{i18n.t('comments.nameHint')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={nameText}
              onChangeText={setNameText}
              placeholder={i18n.t('comments.namePlaceholder')}
              placeholderTextColor="#999"
              maxLength={MAX_NAME_LENGTH}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onFocus={onInputFocus}
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!nameText.trim() || busy) && styles.sendButtonDisabled]}
              onPress={handleSaveName}
              disabled={!nameText.trim() || busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>{i18n.t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.commentInput]}
          value={text}
          onChangeText={setText}
          placeholder={i18n.t('comments.placeholder')}
          placeholderTextColor="#999"
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          onFocus={onInputFocus}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || busy) && styles.sendButtonDisabled]}
          onPress={handlePost}
          disabled={!text.trim() || busy}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>{i18n.t('comments.post')}</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        {i18n.t('comments.title')}{visible.length > 0 ? ` (${visible.length})` : ''}
      </Text>

      {renderComposer()}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={styles.loading} color="#4ECDC4" />
      ) : visible.length === 0 ? (
        <Text style={styles.empty}>{i18n.t('comments.empty')}</Text>
      ) : (
        visible.map((comment) => (
          <View key={comment.id} style={styles.comment}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{comment.authorName?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.commentBody}>
              <View style={styles.commentHeader}>
                <Text style={styles.author} numberOfLines={1}>{comment.authorName}</Text>
                <Text style={styles.time}>{formatTime(comment.createdAt)}</Text>
              </View>
              <Text style={styles.commentText}>{comment.text}</Text>
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => openMenu(comment)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={comment.authorId === user?.uid ? i18n.t('common.delete') : i18n.t('comments.report')}
            >
              <Ionicons
                name={comment.authorId === user?.uid ? 'trash-outline' : 'ellipsis-horizontal'}
                size={16}
                color="#999"
              />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  commentInput: {
    maxHeight: 110,
  },
  sendButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 42,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    borderRadius: 12,
    paddingVertical: 12,
  },
  signInText: {
    color: '#4ECDC4',
    fontSize: 15,
    fontWeight: '600',
  },
  nameTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  nameHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    marginBottom: 8,
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 8,
  },
  loading: {
    marginTop: 20,
  },
  empty: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
    lineHeight: 20,
  },
  comment: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8FAF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#4ECDC4',
    fontWeight: '700',
    fontSize: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  author: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    flexShrink: 1,
  },
  time: {
    fontSize: 12,
    color: '#999',
  },
  commentText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 21,
    marginTop: 2,
  },
  menuButton: {
    paddingTop: 2,
  },
});
