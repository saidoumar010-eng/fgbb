import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/lib/nav';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ChipSelect } from '@/components/chip-select';
import { Button, Card, Empty, Field, Header, Row, Screen } from '@/components/ui';
import { listMatches } from '@/lib/db';
import {
  addPhotos,
  deletePhoto,
  listAlbums,
  listPhotos,
  reorderPhoto,
  updatePhoto,
} from '@/lib/db-content';
import { fullDate, teamShort } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { C, R, S } from '@/lib/theme';
import type { Photo } from '@/lib/types';
import { pickAndUploadImages } from '@/lib/upload';
import { useFetch } from '@/lib/useFetch';

type Mode = 'album' | 'match';

// Gestion des galeries : on ouvre d'abord une destination (un album nommé ou
// un match), puis on y envoie et on y annote les photos.
export default function AdminPhotos() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>('album');
  const [albumText, setAlbumText] = useState('');
  // Destination ouverte : distincte du champ de saisie pour ne pas relancer
  // une requête à chaque caractère tapé.
  const [album, setAlbum] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const albums = useFetch(() => listAlbums());
  const matches = useFetch(() => listMatches());
  const photos = useFetch(
    async () => (album || matchId ? listPhotos({ album, matchId }) : []),
    [album, matchId],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const list = photos.data ?? [];
  const opened = !!album || !!matchId;

  const albumNames = useMemo(
    () => (albums.data ?? []).filter((g) => g.kind === 'album').map((g) => g.album as string),
    [albums.data],
  );
  // Les matchs récents d'abord : ce sont eux que l'on photographie.
  const matchList = useMemo(() => [...(matches.data ?? [])].reverse(), [matches.data]);

  function openAlbum(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setAlbumText(clean);
    setMatchId(null);
    setAlbum(clean);
    setFlash(null);
  }

  function openMatch(id: string) {
    setAlbum(null);
    setMatchId(id);
    setFlash(null);
  }

  async function upload() {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const urls = await pickAndUploadImages('photos', 20);
      if (urls.length === 0) return;
      await addPhotos(
        urls.map((url, i) => ({
          match_id: matchId,
          album: matchId ? null : album,
          url,
          position: list.length + i,
        })),
      );
      await photos.reload();
      await albums.reload();
      setFlash(t('{n} photo(s) envoyée(s).', { n: urls.length }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setBusy(false);
    }
  }

  // Réécrit toutes les positions de la galerie : les rangs restent contigus
  // même si d'anciennes photos partageaient la même position.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const order = [...list];
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await Promise.all(order.map((p, i) => reorderPhoto(p.id, i)));
      await photos.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Erreur de chargement'));
    }
  }

  function confirmDelete(p: Photo) {
    Alert.alert(t('Supprimer la photo'), t('Cette action est irréversible.'), [
      { text: t('Annuler'), style: 'cancel' },
      {
        text: t('Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(p.id);
            await photos.reload();
            await albums.reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Erreur de chargement'));
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <Header
        title={t('Photos')}
        left={
          <Pressable onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={24} color={C.muted} />
          </Pressable>
        }
      />

      <View style={{ padding: S.lg, gap: S.md }}>
        <ChipSelect
          options={[
            { id: 'album', label: t('Album') },
            { id: 'match', label: t('Match') },
          ]}
          value={mode}
          onChange={(id) => setMode(id as Mode)}
        />

        {mode === 'album' ? (
          <View style={{ gap: S.sm }}>
            <Row style={{ gap: 10, alignItems: 'flex-end' }}>
              <Field
                label={t('Nom de l’album')}
                placeholder={t('Finale 2026')}
                value={albumText}
                onChangeText={setAlbumText}
                onSubmitEditing={() => openAlbum(albumText)}
                returnKeyType="done"
              />
              <Pressable
                onPress={() => openAlbum(albumText)}
                style={({ pressed }) => [
                  {
                    height: 46,
                    paddingHorizontal: 16,
                    borderRadius: R.sm,
                    backgroundColor: C.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={{ color: C.accentText, fontSize: 14, fontWeight: '600' }}>{t('Ouvrir')}</Text>
              </Pressable>
            </Row>

            {albumNames.length > 0 && (
              <ChipSelect
                options={albumNames.map((a) => ({ id: a, label: a }))}
                value={album}
                onChange={openAlbum}
                wrap
              />
            )}
          </View>
        ) : (
          <View style={{ gap: S.sm }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>{t('Match photographié')}</Text>
            <ChipSelect
              options={matchList.map((m) => ({
                id: m.id,
                label: `${teamShort(m.home_team)} – ${teamShort(m.away_team)} · ${fullDate(m.scheduled_at)}`,
              }))}
              value={matchId}
              onChange={openMatch}
              wrap
            />
          </View>
        )}

        {opened ? (
          <Button
            title={t('Envoyer des photos')}
            icon="cloud-upload-outline"
            onPress={upload}
            loading={busy}
          />
        ) : null}

        {flash ? <Text style={{ color: C.green, fontSize: 13 }}>{flash}</Text> : null}
        {error ? <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text> : null}
      </View>

      {!opened ? (
        <Empty
          icon="images-outline"
          title={t('Choisis une destination')}
          subtitle={t('Ouvre un album existant, saisis un nouveau nom, ou sélectionne un match.')}
        />
      ) : list.length === 0 ? (
        <Empty
          icon="images-outline"
          title={photos.loading ? t('Chargement…') : t('Galerie vide')}
          subtitle={photos.loading ? undefined : t('Envoie les premières photos de cette galerie.')}
        />
      ) : (
        <View style={{ paddingHorizontal: S.lg, gap: 12 }}>
          {list.map((p, i) => (
            <PhotoRow
              key={p.id}
              photo={p}
              first={i === 0}
              last={i === list.length - 1}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onDelete={() => confirmDelete(p)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PhotoRow({
  photo: p,
  first,
  last,
  onUp,
  onDown,
  onDelete,
}: {
  photo: Photo;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [caption, setCaption] = useState(p.caption ?? '');
  const [credit, setCredit] = useState(p.credit ?? '');
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  // Valeurs réellement en base : la liste parente n'est pas rechargée après une
  // annotation, on ne peut donc pas se fier aux props pour détecter un écart.
  const [persisted, setPersisted] = useState({ caption: p.caption ?? '', credit: p.credit ?? '' });
  const [saved, setSaved] = useState(false);

  const dirty = caption !== persisted.caption || credit !== persisted.credit;

  async function save() {
    setSaving(true);
    setRowError(null);
    const next = { caption: caption.trim(), credit: credit.trim() };
    try {
      await updatePhoto(p.id, { caption: next.caption || null, credit: next.credit || null });
      setCaption(next.caption);
      setCredit(next.credit);
      setPersisted(next);
      setSaved(true);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : t('Erreur de chargement'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Row style={{ gap: 12, alignItems: 'flex-start' }}>
        <Image
          source={{ uri: p.url }}
          style={{ width: 76, height: 76, borderRadius: R.sm, backgroundColor: C.surface2 }}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Field
            label={t('Légende')}
            placeholder={t('Ce que montre la photo')}
            value={caption}
            onChangeText={(v) => {
              setCaption(v);
              setSaved(false);
            }}
          />
          <Field
            label={t('Crédit photo')}
            placeholder={t('Nom du photographe')}
            value={credit}
            onChangeText={(v) => {
              setCredit(v);
              setSaved(false);
            }}
          />
        </View>
      </Row>

      {rowError ? <Text style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{rowError}</Text> : null}

      <Row style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        {saved && !dirty ? (
          <Text style={{ color: C.green, fontSize: 12, marginRight: 'auto' }}>{t('Enregistré')}</Text>
        ) : null}
        <IconButton icon="arrow-up" onPress={onUp} disabled={first} />
        <IconButton icon="arrow-down" onPress={onDown} disabled={last} />
        <IconButton icon="trash-outline" onPress={onDelete} tone="red" />
        <IconButton icon="checkmark" onPress={save} disabled={!dirty || saving} tone="accent" />
      </Row>
    </Card>
  );
}

function IconButton({
  icon,
  onPress,
  disabled,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'accent' | 'red';
}) {
  const color = tone === 'accent' ? C.accent : tone === 'red' ? C.red : C.muted;
  const bg = tone === 'accent' ? C.accentSoft : tone === 'red' ? C.redSoft : 'rgba(255,255,255,0.07)';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          width: 36,
          height: 36,
          borderRadius: R.sm,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={icon} size={17} color={color} />
    </Pressable>
  );
}
