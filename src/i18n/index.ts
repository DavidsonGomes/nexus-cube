import { createContext, useContext } from 'react';
import type { TimingModeId } from '../data/trainers';
import type { TrainerNodeKey } from '../components/trainers/catalog';
import { ptBR } from './pt-BR';

/** Own typed dictionary, no library: pt-BR is the source of truth and `Messages`
 * makes every future locale file (es, en) provably complete at compile time.
 * The language switcher and the extraction of pre-existing strings are a later,
 * separate cut; new UI must read every string from here from now on. */
export type Messages = typeof ptBR;
export type Locale = 'pt-BR' | 'es' | 'en';
export const DEFAULT_LOCALE: Locale = 'pt-BR';

const dictionaries: Partial<Record<Locale, Messages>> = { 'pt-BR': ptBR };

export function dictionaryFor(locale: Locale): Messages {
  return dictionaries[locale] ?? ptBR;
}

const I18nContext = createContext<Messages>(ptBR);
export const I18nProvider = I18nContext.Provider;
export function useI18n(): Messages {
  return useContext(I18nContext);
}

type TrainerEntry = { name: string; description: string; submodes: readonly string[] };
type TimingEntry = { label: string; summary: string };
// Compile-time completeness against the catalog structure and the Prisma timing contract.
const trainerEntries: Record<TrainerNodeKey, TrainerEntry> = ptBR.trainers.catalog;
const timingEntries: Record<TimingModeId, TimingEntry> = ptBR.trainers.timing;
void trainerEntries; void timingEntries;
