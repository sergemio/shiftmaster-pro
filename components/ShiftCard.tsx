
import React from 'react';
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
  orphanReason = null
}) => {
  if (!staff) return null;
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
        // Prevent drag start on mobile to avoid accidental moves/deletions during tap
        if (window.innerWidth < 768) return;
        onDragStart(e, 'move');
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isReadOnly) return;
        // On mobile, single click to edit
        if (window.innerWidth < 768) {
          onEdit();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isReadOnly || window.innerWidth < 768) return;
        onEdit();
      }}
      style={{
        ...style,
        backgroundColor: shift.coverageBy ? '#f1f5f9' : staff.color + '15',
        borderColor: shift.coverageBy ? '#94a3b8' : staff.color,
        borderWidth: '0 0 0 4px',
        color: '#1e293b',
        cursor: isReadOnly ? 'default' : 'grab'
      }}
    >
      {!isReadOnly && (
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
          <span className="text-xs font-bold text-slate-600 leading-tight whitespace-nowrap @max-[104px]:hidden">
            {formatTime(startTime)} - {formatTime(endTime)}
          </span>
          <div className="flex gap-1 flex-wrap">
            <span className="bg-slate-200/60 text-slate-600 text-xs font-black px-1 md:px-1.5 py-0.5 rounded uppercase tracking-tighter border border-slate-300/30">
              {duration.toFixed(duration % 1 === 0 ? 0 : 1)}H
            </span>
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
                {/* Sous ~104px de large, rien de textuel ne tient : la carte est
                    une sous-colonne de quelques dizaines de pixels. Le
                    pictogramme reste, l'explication est dans l'infobulle et dans
                    la fiche du shift. */}
                <span className="@max-[104px]:hidden">
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

      {!isReadOnly && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-50 hover:bg-black/10 transition-colors"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDragStart(e, 'resize-bottom');
          }}
        />
      )}
    </div>
  );
};

export default ShiftCard;
