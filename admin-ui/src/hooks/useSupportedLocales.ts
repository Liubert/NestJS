import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import apiClient from '../api/client';

export interface LocaleDefinition {
  code: string;
  name: string;
  aliases: string[];
  localeSkill: string;
  flag: string;
}

export function useSupportedLocales() {
  return useQuery<LocaleDefinition[]>({
    queryKey: ['supported-locales'],
    queryFn: () =>
      apiClient
        .get<LocaleDefinition[]>('/translations/supported-locales')
        .then((r) => r.data),
    staleTime: 24 * 60 * 60 * 1000, // 24h — locale list rarely changes
  });
}

export function useLocaleMap() {
  const { data } = useSupportedLocales();
  return useMemo(() => {
    const map = new Map<string, LocaleDefinition>();
    if (data) {
      for (const l of data) {
        map.set(l.code, l);
      }
    }
    return map;
  }, [data]);
}

export function useFlagForCode() {
  const map = useLocaleMap();
  return (code: string) => map.get(code)?.flag ?? '';
}
