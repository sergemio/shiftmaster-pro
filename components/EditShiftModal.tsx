import React, { useState, useEffect, useMemo } from 'react';
import { Staff, Shift } from '../types';
import { START_HOUR, END_HOUR } from '../constants';
import { formatTime } from '../utils/helpers';

interface EditShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift | null;
  staffList: Staff[];
  onUpdate: (updatedShift: Shift) => void;
  onDelete: (id: string) => void;
  isReadOnly?: boolean;
  language: string;
}

const EditShiftModal: React.FC<EditShiftModalProps> = ({ isOpen, onClose, shift, staffList, onUpdate, onDelete, isReadOnly = false, language }) => {
  if (!isOpen || !shift) return null;

  const [staffId, setStaffId] = useState(shift.staffId);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [coverageBy, setCoverageBy] = useState(shift.coverageBy || '');
  const [notes, setNotes] = useState(shift.notes || '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (shift) {
      setStaffId(shift.staffId);
      setStartTime(shift.startTime);
      setEndTime(shift.endTime);
      setCoverageBy(shift.coverageBy || '');
      setNotes(shift.notes || '');
      setIsConfirmingDelete(false);
    }
  }, [shift]);

  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      // Changed: increment by 30 minutes instead of 15
      for (let m = 0; m < 60; m += 30) {
        if (h === END_HOUR && m > 0) break;
        const val = h + m / 60;
        options.push({ value: val, label: formatTime(val) });
      }
    }
    return options;
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (endTime <= startTime) {
      alert("End time must be after start time");
      return;
    }

    // PREVENT REDUNDANT UPDATES: Compare form state with original shift
    const sanitizedCoverage = coverageBy.trim() || null as any;
    const sanitizedNotes = notes.trim() || null as any;

    const isUnchanged = staffId === shift.staffId &&
                        startTime === shift.startTime &&
                        endTime === shift.endTime &&
                        (sanitizedCoverage || '') === (shift.coverageBy || '') &&
                        (sanitizedNotes || '') === (shift.notes || '');

    if (!isUnchanged) {
      onUpdate({
        ...shift,
        staffId,
        startTime,
        endTime,
        coverageBy: sanitizedCoverage,
        notes: sanitizedNotes
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (isReadOnly) return;
    onDelete(shift.id);
    onClose();
  };

  const assignedStaff = staffList.find(s => s.id === staffId);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-6 md:p-8 pb-4 flex justify-between items-start border-b border-slate-50">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800">{isReadOnly ? 'View Shift' : 'Edit Shift'}</h2>
            <p className="text-xs md:text-sm text-slate-400 font-medium">{isReadOnly ? 'Details' : 'Detailed configuration'}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors p-1">
            <svg className="w-6 h-6 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 md:p-8 pt-6 space-y-4 md:space-y-6">
          {!isConfirmingDelete ? (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Assigned To</label>
                <div className="relative">
                  <select 
                    disabled={isReadOnly}
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                  >
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {!isReadOnly && (
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">Start Time</label>
                  <div className="relative">
                    <select 
                      disabled={isReadOnly}
                      value={startTime}
                      onChange={(e) => setStartTime(parseFloat(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                    >
                      {timeOptions.filter(o => o.value < END_HOUR).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">End Time</label>
                  <div className="relative">
                    <select 
                      disabled={isReadOnly}
                      value={endTime}
                      onChange={(e) => setEndTime(parseFloat(e.target.value))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80"
                    >
                      {timeOptions.filter(o => o.value > startTime).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Coverage (Heures Sup)</label>
                <div className="relative">
                   <select 
                    disabled={isReadOnly}
                    value={coverageBy}
                    onChange={(e) => setCoverageBy(e.target.value)}
                    className={`w-full bg-slate-50/50 border rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all disabled:opacity-80 ${coverageBy ? 'border-indigo-300 bg-indigo-50/30 text-indigo-900' : 'border-slate-200'}`}
                  >
                    <option value="">No coverage (Normal shift)</option>
                    {staffList.filter(s => s.id !== staffId).map(s => (
                      <option key={s.id} value={s.id}>Covered by {s.name}</option>
                    ))}
                  </select>
                </div>
                {coverageBy && (
                  <p className="mt-3 text-xs text-indigo-600 font-semibold leading-relaxed">
                    ℹ️ {assignedStaff?.name} will be on leave. The covering person will gain extra hours.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">Notes</label>
                <textarea 
                  readOnly={isReadOnly}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isReadOnly ? "No notes" : "Add details about this shift..."}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-base font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="pt-4 space-y-4">
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 transition-all text-base shadow-sm active:scale-95"
                  >
                    {isReadOnly ? 'Close' : 'Cancel'}
                  </button>
                  {!isReadOnly && (
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-base active:scale-95"
                    >
                      Save Changes
                    </button>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex justify-center pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsConfirmingDelete(true)}
                      className="text-red-500 hover:text-red-600 font-black text-xs uppercase tracking-widest transition-colors py-2 flex items-center gap-2 group"
                    >
                      <svg className="w-4 h-4 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Shift
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-6 space-y-8 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Are you sure?</h3>
                <p className="text-slate-500 leading-relaxed">
                  You are about to delete the shift for <span className="font-bold text-slate-800">{assignedStaff?.name}</span>. This action cannot be undone.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  type="button"
                  onClick={handleDelete}
                  className="w-full py-4 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-100 text-base active:scale-95"
                >
                  Yes, Delete Shift
                </button>
                <button 
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all text-base active:scale-95"
                >
                  No, Keep It
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default EditShiftModal;