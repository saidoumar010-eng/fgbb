import { Pressable, ScrollView, Text } from 'react-native';

import { C, R } from '@/lib/theme';

export interface Option {
  id: string;
  label: string;
  color?: string | null;
}

export function ChipSelect({
  options,
  value,
  onChange,
  wrap,
}: {
  options: Option[];
  value?: string | null;
  onChange: (id: string) => void;
  wrap?: boolean;
}) {
  const content = options.map((o) => {
    const on = value === o.id;
    return (
      <Pressable
        key={o.id}
        onPress={() => onChange(o.id)}
        style={{
          backgroundColor: on ? C.accent : '#181D26',
          borderColor: on ? C.accent : C.border,
          borderWidth: 1,
          borderRadius: R.pill,
          paddingHorizontal: 14,
          paddingVertical: 8,
          marginRight: 8,
          marginBottom: wrap ? 8 : 0,
        }}>
        <Text style={{ color: on ? C.accentText : C.muted, fontSize: 13, fontWeight: '500' }}>
          {o.label}
        </Text>
      </Pressable>
    );
  });

  if (wrap) {
    return (
      <Pressable style={{ flexDirection: 'row', flexWrap: 'wrap' }} disabled>
        {content}
      </Pressable>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}
