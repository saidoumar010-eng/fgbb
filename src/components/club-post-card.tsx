import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text } from 'react-native';

import { Card, Row } from '@/components/ui';
import { fullDate } from '@/lib/format';
import { C, R } from '@/lib/theme';
import type { ClubPost } from '@/lib/types';

/**
 * Une publication de club. Le même rendu sert le fil public (page équipe) et la
 * gestion côté dirigeant — `onDelete` n'est fourni que dans ce second cas.
 */
export function ClubPostCard({ post, onDelete }: { post: ClubPost; onDelete?: () => void }) {
  return (
    <Card>
      {post.image_url ? (
        <Image
          source={{ uri: post.image_url }}
          style={{ width: '100%', height: 180, borderRadius: R.md, marginBottom: 10 }}
          contentFit="cover"
        />
      ) : null}
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{post.body}</Text>
      <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ color: C.dim, fontSize: 11 }}>{fullDate(post.created_at)}</Text>
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button">
            <Ionicons name="trash-outline" size={16} color={C.red} />
          </Pressable>
        ) : null}
      </Row>
    </Card>
  );
}
