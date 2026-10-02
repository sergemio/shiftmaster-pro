import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { commonTimeZones, timeZoneChoices } from '../utils/helpers';

/**
 * Choix du fuseau du restaurant (creation du restaurant et Parametres).
 * Liste courte d'abord ; « Autre fuseau… » deplie la liste complete.
 */
const MORE = '__more';

// Noms de villes plutot que « Europe/Paris » (QA du 02/10/2026). Les autres
// fuseaux gardent leur derniere partie : « Asia/Makassar » devient « Makassar ».
const CITY_FR: Record<string, string> = {
  'Europe/Paris': 'Paris', 'Europe/Brussels': 'Bruxelles', 'Europe/Zurich': 'Zurich',
  'Europe/Luxembourg': 'Luxembourg', 'Europe/London': 'Londres', 'Europe/Lisbon': 'Lisbonne',
  'Europe/Madrid': 'Madrid', 'Asia/Beirut': 'Beyrouth', 'Asia/Dubai': 'Dubaï',
  'Africa/Casablanca': 'Casablanca', 'America/Toronto': 'Toronto', 'America/New_York': 'New York',
  'Indian/Reunion': 'La Réunion', 'America/Martinique': 'Martinique',
};
const cityLabel = (z: string, fr: boolean) =>
  (fr && CITY_FR[z]) || (z.split('/').pop() || z).replace(/_/g, ' ');

const TimeZoneSelect: React.FC<{
  value: string;
  onChange: (tz: string) => void;
  language: Language | string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}> = ({ value, onChange, language, id, ariaLabel, className }) => {
  const t = getTranslation(language as Language);
  const [showAll, setShowAll] = useState(false);
  const zones = showAll ? timeZoneChoices() : commonTimeZones(value);
  return (
    <select id={id} value={value} aria-label={ariaLabel} className={className}
      onChange={e => { if (e.target.value === MORE) setShowAll(true); else onChange(e.target.value); }}>
      {zones.map(z => <option key={z} value={z}>{showAll ? z.replace(/_/g, ' ') : cityLabel(z, language === 'fr')}</option>)}
      {!showAll && <option value={MORE}>{t('tzMore')}</option>}
    </select>
  );
};

export default TimeZoneSelect;
