import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

// Sélectionne une image dans la galerie et l'upload dans le bucket "media".
// Renvoie l'URL publique, ou null si l'utilisateur annule.
export async function pickAndUploadImage(folder: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Autorise l'accès aux photos pour envoyer une image.");

  const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
  if (res.canceled) return null;

  const asset = res.assets?.[0];
  if (!asset?.base64) throw new Error("Impossible de lire l'image sélectionnée.");

  const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
  const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const path = `${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('media')
    .upload(path, decode(asset.base64), { contentType, upsert: true });
  if (error) throw error;

  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

// Sélectionne plusieurs images à la fois (galeries photo d'un match).
export async function pickAndUploadImages(folder: string, max = 20): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Autorise l'accès aux photos pour envoyer une image.");

  const res = await ImagePicker.launchImageLibraryAsync({
    base64: true,
    quality: 0.6,
    allowsMultipleSelection: true,
    selectionLimit: max,
  });
  if (res.canceled) return [];

  const urls: string[] = [];
  for (const [i, asset] of (res.assets ?? []).entries()) {
    if (!asset.base64) continue;
    const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
    const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const path = `${folder}/${Date.now()}-${i}.${ext}`;
    const { error } = await supabase.storage
      .from('media')
      .upload(path, decode(asset.base64), { contentType, upsert: true });
    if (error) throw error;
    urls.push(supabase.storage.from('media').getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

// Documents administratifs (justificatifs de licence) : bucket PRIVÉ.
// On stocke le chemin, pas une URL publique — la consultation passe ensuite
// par une URL signée à durée limitée réservée aux administrateurs.
export async function pickAndUploadDocument(folder: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Autorise l'accès aux photos pour envoyer un document.");

  const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
  if (res.canceled) return null;

  const asset = res.assets?.[0];
  if (!asset?.base64) throw new Error('Impossible de lire le document sélectionné.');

  const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
  const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const path = `${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, decode(asset.base64), { contentType, upsert: true });
  if (error) throw error;

  return path;
}

// URL signée (1 h) pour consulter un document privé.
export async function signedDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// Sélectionne une image et renvoie son contenu base64 (pour l'analyse IA), sans upload.
export async function pickImageBase64(): Promise<{ base64: string; mediaType: string } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Autorise l'accès aux photos.");
  const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.base64) throw new Error("Impossible de lire l'image sélectionnée.");
  const ext = (asset.uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
  const mediaType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return { base64: asset.base64, mediaType };
}
