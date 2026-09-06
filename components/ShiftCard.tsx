
import React, { useRef } from 'react';
import { Shift, Staff, DragType, Language } from '../types';
import { formatTime, formatShortDate, OrphanReason } from '../utils/helpers';
import { getTranslation } from '../utils/translations';

interface ShiftCardProps {
  shift: Shift;
  staff?: Staff;
  allStaff?: Staff[];
  style: React.CSSProperties;
  onDragStart: (e: React.MouseEvent, type: DragType) => void;
  onEdit: () => void;
  isReadOnly?: boolean;
  renderStartTime?: number;
  renderEndTime?: number;
  language?: Language;
  /** Pourquoi le shift sort de la periode d'emploi, ou null s'il est normal. */
  orphanReason?: OrphanReason;
  /** Cette personne a un autre shift au meme moment le meme jour. */
  hasOverlap?: boolean;
  /** Phrases des regles de duree du travail que ce shift enfreint. Ambre et non
   *  rouge : depasser 10 h n'est pas une erreur de saisie, c'est une decision
   *  que l'employeur a le droit de prendre en connaissance de cause. */
  ruleWarnings?: string[];
  /** Ce shift fait partie de la selection en cours. */
  isSelected?: boolean;
  /** Une selection est ouverte : un simple appui coche au lieu d'ouvrir la fiche. */
  selectionMode?: boolean;
  onToggleSelect?: () => void;
}

const ShiftCard: React.FC<ShiftCardProps> = ({ 
  shift, 
  staff, 
  allStaff, 
  style, 
  onDragStart, 
  onEdit, 
  isReadOnly = false,
  renderStartTime,
  renderEndTime,
  language = 'en',
  orphanReason = null,
  hasOverlap = false,
  ruleWarnings = [],
  isSelected = false,
  selectionMode = false,
  onToggleSelect
}) => {
  if (!staff) return null;

  /**
   * Appui long = entrer en selection, sur telephone ou le clic droit et les
   * touches modificatrices n'existent pas. Le drapeau evite le double effet :
   * l'appui long declenche la selection, puis le `click` de fin de geste
   * arriverait derriere et la decocherait aussitot.
   */
  const longPress = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });

  const cancelLongPress = () => {
    if (longPress.current.timer !== null) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  };

  const startLongPress = () => {
    if (isReadOnly || !onToggleSelect) return;
    longPress.current.fired = false;
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      onToggleSelect();
    }, 450);
  };
  // Fix: cast language to Language to avoid string assignability error during translation retrieval
  const t = getTranslation(language as Language);

  const coverStaff = allStaff?.find(s => s.id === shift.coverageBy);
  
  const startTime = renderStartTime ?? shift.startTime;
  const endTime = renderEndTime ?? shift.endTime;
  const duration = endTime - startTime;

  return (
    <div 
      className={`@container rounded-md px-2 py-1.5 md:px-2 md:py-1.5 @max-[64px]:px-1 shadow-sm flex flex-col overflow-hidden border-l-4 group relative transition-transform ${isReadOnly ? '' : 'active:scale-[0.98]'} ${shift.coverageBy ? 'opacity-90' : ''}`}
      onMouseDown={(e) => {
        if (isReadOnly) return;
        // Ctrl/Cmd+clic coche au lieu de deplacer : sans ca le geste de selection
        // du bureau demarrerait un glisser en meme temps.
        if (e.ctrlKey || e.metaKey || selectionMode) return;
        // Prevent drag start on mobile to avoid accidental moves/deletions during tap
        if (window.innerWidth < 768) return;
        onDragStart(e, 'move');
      }}
      onTouchStart={startLongPress}
      onTouchMove={cancelLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onClick={(e) => {
        e.stopPropagation();
        if (isReadOnly) return;
        // L'appui long vient de cocher : ce clic est la fin du meme geste.
        if (longPress.current.fired) {
          longPress.current.fired = false;
          return;
        }
        if (onToggleSelect && (selectionMode || e.ctrlKey || e.metaKey)) {
          onToggleSelect();
          return;
        }
        // On mobile, single click to edit
        if (window.innerWidth < 768) {
          onEdit();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isReadOnly || selectionMode || window.innerWidth < 768) return;
        onEdit();
      }}
      style={{
        ...style,
        backgroundColor: shift.coverageBy ? '#f1f5f9' : staff.color + '15',
        borderColor: shift.coverageBy ? '#94a3b8' : staff.color,
        borderWidth: '0 0 0 4px',
        // Un CONTOUR, pas une bordure : le contour ne prend pas de place, donc
        // cocher une carte ne decale pas ses voisines dans la colonne.
        outline: isSelected ? '2px solid #4f46e5' : undefined,
        outlineOffset: isSelected ? '1px' : undefined,
        color: '#1e293b',
        cursor: isReadOnly ? 'default' : 'grab'
      }}
    >
      {!isReadOnly && !selectionMode && (
        <div 
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-50 hover:bg-black/10 transition-colors"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDragStart(e, 'resize-top');
          }}
        />
      )}

      <div className="flex flex-col pointer-events-none h-full">
        <div className="flex justify-between items-start mb-0.5 md:mb-1 overflow-hidden flex-shrink-0">
          <span className={`font-black text-xs md:text-sm truncate whitespace-nowrap block w-full ${shift.coverageBy ? 'line-through text-slate-400' : 'text-slate-900'}`}>
            {staff.name}
          </span>
        </div>
        
        <div className="flex flex-col gap-1 md:gap-1.5">
          {/* L'horaire ne se masque JAMAIS. Il se replie sur deux lignes quand la
              colonne est etroite, comme il l'a toujours fait — c'est lisible, et
              c'est l'information la plus utile apres le nom.
              Le 06/09/2026 j'avais ajoute un masquage sous 104px pour eviter que
              l'horaire se replie en trois lignes tronquees dans une sous-colonne
              de 40px. Mauvais arbitrage, signale par Serge : le seuil attrapait
              les colonnes de jour ordinaires, et l'horaire disparaissait dans le
              cas courant pour regler un cas rare. */}
          <span className="text-xs font-bold text-slate-600 leading-tight">
            {formatTime(startTime)} - {formatTime(endTime)}
          </span>
          <div className="flex gap-1 flex-wrap">
            <span className="bg-slate-200/60 text-slate-600 text-xs font-black px-1 md:px-1.5 py-0.5 rounded uppercase tracking-tighter border border-slate-300/30">
              {duration.toFixed(duration % 1 === 0 ? 0 : 1)}H
            </span>
            {hasOverlap && (
              /* Rouge assume ici, contrairement au badge de periode d'emploi :
                 personne ne peut etre a deux endroits a la fois, c'est une
                 erreur de saisie et non une situation normale (R5.2). */
              <span
                title={`${staff.name} a deja un autre shift a ce moment-la`}
                className="bg-red-100 text-red-800 text-xs font-bold px-1 md:px-1.5 py-0.5 rounded border border-red-300 basis-full leading-tight"
              >
                {/* Un seul mot court : il se replie plutot que de disparaitre.
                    Un badge reduit au pictogramme laisse deviner le probleme,
                    ce qui est precisement le defaut corrige plus tot. */}
                ⚠ {t('overlapWarning')}
              </span>
            )}
            {ruleWarnings.length > 0 && (
              <span
                title={ruleWarnings.join(' · ')}
                className="bg-amber-100 text-amber-800 text-xs font-bold px-1 md:px-1.5 py-0.5 rounded border border-amber-300 basis-full leading-tight"
              >
                {/* Le detail est dans l'infobulle et dans le recapitulatif : la
                    carte n'a pas la place d'une phrase, mais elle doit dire
                    qu'il y a quelque chose a lire. */}
                ⚠ {ruleWarnings.length > 1 ? `${ruleWarnings.length} ${t('ruleBadgePlural')}` : t('ruleBadge')}
              </span>
            )}
            {orphanReason && (
              /* Le badge disait « Ghost » : l'utilisateur devait deviner pourquoi.
                 Il enonce maintenant la raison, que l'app connait exactement.
                 Pas de capitales ici : c'est une phrase, pas une etiquette, et
                 les capitales la rendraient plus large sans la rendre plus lisible. */
              <span
                title={
                  orphanReason.kind === 'after-end'
                    ? `${staff.name} a quitte l'equipe le ${formatShortDate(orphanReason.date, language)} — ce shift est apres son depart`
                    : `${staff.name} arrive le ${formatShortDate(orphanReason.date, language)} — ce shift est avant son arrivee`
                }
                className="bg-amber-100 text-amber-800 text-xs font-bold px-1 md:px-1.5 py-0.5 rounded border border-amber-300 basis-full leading-tight"
              >
                ⚠{' '}
                {/* Le badge prend toute la largeur de la carte et se replie, donc
                    il n'a besoin de disparaitre que dans une sous-colonne ou plus
                    rien de textuel ne tient. Seuil bas, pour la meme raison que
                    l'horaire ci-dessus. */}
                <span className="@max-[56px]:hidden">
                  {orphanReason.kind === 'after-end' ? t('leftOn') : t('startsOn')}{' '}
                  {formatShortDate(orphanReason.date, language)}
                </span>
              </span>
            )}
          </div>
        </div>

        {shift.notes && (
          <p className="text-xs text-slate-500 font-semibold leading-snug mt-2 italic break-words whitespace-normal flex-1 overflow-hidden">
            {shift.notes}
          </p>
        )}

        {shift.coverageBy && coverStaff && (
          <div className="mt-auto pt-2 pb-0.5">
             {/* Deux lignes plutot qu'une phrase qui se replie : a la taille de
                 texte lisible, « COVERED BY: ABDELRAHMAN » coupait le prenom en
                 plein milieu d'un mot. Le libelle tient seul, le nom est tronque
                 proprement s'il est trop long pour la colonne. */}
             <div className="px-2 py-1 bg-indigo-600 rounded text-white uppercase shadow-sm">
               <div className="text-xs font-bold leading-tight opacity-80">{t('coveredBy')}</div>
               <div className="text-xs font-black leading-tight truncate">{coverStaff.name}</div>
             </div>
          </div>
        )}
      </div>

      {!isReadOnly && !selectionMode && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-50 hover:bg-black/10 transition-colors"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDragStart(e, 'resize-bottom');
          }}
        />
      )}

      {/* Le contour seul se remarque mal sur une carte deja coloree et bordee.
          La pastille dit « coche » sans ambiguite, meme sur une colonne etroite. */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow z-50 pointer-events-none">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default ShiftCard;
