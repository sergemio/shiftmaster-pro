import React, { useState, useMemo } from 'react';
import { Staff } from '../types';
import { isFormerStaff, todayIso } from '../utils/helpers';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: Staff[];
  guestEmails: string[];
  onAdd: (staff: Staff) => void;
  onUpdate: (staff: Staff) => void;
  onAddGuest: (email: string) => void;
  onRemoveGuest: (email: string) => void;
  language: string;
}

const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  staffList,
  guestEmails = [],
  onAdd,
  onUpdate,
  onAddGuest,
  onRemoveGuest,
  language
}) => {
  if (!isOpen) return null;

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTargetHours, setNewTargetHours] = useState(40);
  const [newColor, setNewColor] = useState('#6366f1');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [isAddingGuest, setIsAddingGuest] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTargetHours, setEditTargetHours] = useState(0);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [showSavedId, setShowSavedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ staff: Staff; action: 'leave' | 'reinstate' } | null>(null);

  // Active people first, then former ones (most recently gone at the top).
  const orderedStaff = useMemo(() => {
    return [...staffList].sort((a, b) => {
      const fa = isFormerStaff(a), fb = isFormerStaff(b);
      if (fa !== fb) return fa ? 1 : -1;
      if (fa && fb) return (b.endDate || '').localeCompare(a.endDate || '');
      return 0;
    });
  }, [staffList]);

  const applyConfirmed = () => {
    if (!confirming) return;
    const { staff, action } = confirming;
    onUpdate({ ...staff, endDate: action === 'leave' ? todayIso() : null });
    setConfirming(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) {
      alert("Name and Email are required");
      return;
    }
    
    if (!newStartDate) {
      alert("Start date is required");
      return;
    }

    const newStaff: Staff = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      email: (newEmail || '').trim().toLowerCase(),
      color: newColor,
      targetHours: newTargetHours,
      role: newRole,
      jobTitle: newJobTitle,
      startDate: newStartDate,
      endDate: newEndDate || null,
    };

    onAdd(newStaff);
    setNewName('');
    setNewEmail('');
    setNewTargetHours(40);
    setNewRole('staff');
    setNewJobTitle('');
    setNewColor('#6366f1');
    setNewStartDate('');
    setNewEndDate('');
    setIsAddingNew(false);
  };

  const startEditing = (staff: Staff) => {
    setEditingId(staff.id);
    setEditTargetHours(staff.targetHours);
    setEditEmail(staff.email || '');
    setEditRole(staff.role);
    setEditJobTitle(staff.jobTitle || '');
    setEditColor(staff.color);
    setEditStartDate(staff.startDate || '');
    setEditEndDate(staff.endDate || '');
    setIsAddingNew(false); // Hide add form if we start editing someone
  };

  const saveEdit = (e: React.MouseEvent, staff: Staff) => {
    e.stopPropagation(); 
    
    onUpdate({
      ...staff,
      targetHours: editTargetHours,
      email: (editEmail || '').trim().toLowerCase(),
      role: editRole,
      jobTitle: editJobTitle,
      color: editColor,
      startDate: editStartDate || undefined,
      endDate: editEndDate || null,
    });
    
    setShowSavedId(staff.id);
    setEditingId(null);
    
    setTimeout(() => {
      setShowSavedId(null);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {confirming && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 animate-in zoom-in-95 duration-150">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${confirming.action === 'leave' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={confirming.action === 'leave' ? 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' : 'M3 8l4-4m0 0l4 4M7 4v9a3 3 0 003 3h8'} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center">
              {confirming.action === 'leave'
                ? `Mark ${confirming.staff.name} as having left?`
                : `Bring ${confirming.staff.name} back?`}
            </h3>
            <p className="text-sm text-slate-500 text-center mt-2 leading-relaxed">
              {confirming.action === 'leave' ? (
                <>Their last day will be set to <b className="text-slate-700">{todayIso()}</b>. They disappear from
                the weeks that follow, but <b className="text-slate-700">every shift they already worked stays
                visible</b> and their hours remain usable for payroll.</>
              ) : (
                <>Their end date will be cleared and they will appear again on the current and upcoming weeks.</>
              )}
            </p>
            <div className="flex flex-col gap-2.5 mt-6">
              <button
                onClick={applyConfirmed}
                className={`w-full py-3.5 rounded-2xl font-bold text-white transition-all active:scale-95 shadow-lg ${confirming.action === 'leave' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
              >
                {confirming.action === 'leave' ? 'Yes, they have left' : 'Yes, bring them back'}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="w-full py-3.5 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-800">Manage Staff Roster</h2>
            <p className="text-[8px] md:text-[10px] text-slate-400 font-medium uppercase tracking-widest">Tap a member to edit details</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-white">
          <h3 className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
            <span>Current Team ({orderedStaff.filter(s => !isFormerStaff(s)).length})</span>
          </h3>
          <div className="space-y-2">
            {orderedStaff.map((staff, idx) => {
              const isFormer = isFormerStaff(staff);
              // One list, sorted, with a divider before the first former member —
              // simpler than two lists and it keeps a single row rendering.
              const startsFormerSection = isFormer && !isFormerStaff(orderedStaff[idx - 1] ?? staff);
              return (
              <React.Fragment key={staff.id}>
              {startsFormerSection && (
                <div className="flex items-center gap-3 pt-4 pb-1">
                  <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    Former Team ({orderedStaff.filter(s => isFormerStaff(s)).length})
                  </span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
              )}
              <div
                onClick={() => startEditing(staff)}
                className={`flex flex-col p-3 transition-all rounded-xl border group relative cursor-pointer ${editingId === staff.id ? 'bg-indigo-50 border-indigo-200 shadow-inner' : isFormer ? 'bg-white border-dashed border-slate-200 opacity-70 hover:opacity-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-slate-200'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold relative shadow-sm" style={{ backgroundColor: staff.color }}>
                      {staff.name.charAt(0)}
                      {staff.role === 'admin' && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-amber-400 rounded-full p-0.5 border border-white">
                          <svg className="w-2.5 h-2.5 text-amber-900" fill="currentColor" viewBox="0 0 20 20"><path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" /></svg>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 flex items-center gap-1.5 leading-none">
                        {staff.name}
                        <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest ${staff.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                          {staff.role}
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 font-medium truncate max-w-[200px]">{staff.email}</p>
                      {isFormer && (
                        <p className="text-[10px] text-amber-700 font-bold mt-0.5">
                          Left on {staff.endDate} · history kept
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {editingId !== staff.id && (
                    <div className="flex items-center gap-2">
                      {showSavedId === staff.id && (
                        <span className="text-[10px] font-bold text-green-600 animate-in fade-in slide-in-from-right-2">Saved! ✓</span>
                      )}
                      {/* Nobody is ever deleted: an end date is set instead, so
                          their past shifts and hours stay usable for payroll. */}
                      {isFormer ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirming({ staff, action: 'reinstate' }); }}
                          title="Bring back to the active team"
                          className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-all"
                        >
                          Reinstate
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirming({ staff, action: 'leave' }); }}
                          title="Mark as having left — keeps their history"
                          className="p-2 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {editingId === staff.id && (
                  <div className="mt-3 pt-3 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-200 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Weekly Target (h)</label>
                        <input 
                          type="number"
                          value={editTargetHours}
                          onChange={(e) => setEditTargetHours(parseInt(e.target.value))}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Access Role</label>
                        <select 
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as 'admin' | 'staff')}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="staff">Regular Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Google Email Address</label>
                      <input 
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Required for login permissions"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">First Day on the Job</label>
                        <input
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Last Day on the Job <span className="text-slate-400 normal-case font-medium">(leave empty if still employed)</span></label>
                        <input
                          type="date"
                          value={editEndDate}
                          onChange={(e) => setEditEndDate(e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-indigo-200 rounded text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-700 uppercase mb-1">Brand Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-10 h-8 p-1 bg-white border border-indigo-200 cursor-pointer rounded overflow-hidden shadow-sm"
                        />
                        <input 
                          type="text" 
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="flex-1 px-2 py-1 bg-white border border-indigo-200 rounded text-[10px] font-mono outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button 
                        type="button"
                        onClick={(e) => saveEdit(e, staff)}
                        className="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 active:scale-95"
                      >
                        Apply Changes
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                        className="px-3 py-2 bg-white border border-indigo-200 text-indigo-600 text-[10px] font-bold rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </React.Fragment>
              );
            })}
          </div>

          {/* Guest Admins Section */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h3 className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
              <span>Approved Guest Admins ({guestEmails.length})</span>
            </h3>
            
            <div className="space-y-2">
              {guestEmails.map((email) => (
                <div key={email} className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-amber-900 font-bold shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 leading-none">{email}</p>
                      <p className="text-[9px] text-amber-600 mt-1 font-black uppercase tracking-tighter">External Admin Access</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm(`Remove ${email} from guest admins?`)) onRemoveGuest(email);
                    }}
                    className="p-2 text-amber-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}

              {isAddingGuest ? (
                <div className="p-3 bg-white border-2 border-dashed border-amber-200 rounded-xl animate-in slide-in-from-top-2 duration-200">
                  <div className="flex gap-2">
                    <input 
                      type="email"
                      value={newGuestEmail}
                      onChange={(e) => setNewGuestEmail(e.target.value)}
                      placeholder="Enter Google Email"
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onAddGuest(newGuestEmail);
                          setNewGuestEmail('');
                          setIsAddingGuest(false);
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        onAddGuest(newGuestEmail);
                        setNewGuestEmail('');
                        setIsAddingGuest(false);
                      }}
                      className="px-3 py-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      Add
                    </button>
                    <button 
                      onClick={() => setIsAddingGuest(false)}
                      className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-[10px] font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingGuest(true)}
                  className="w-full py-2.5 border border-dashed border-amber-200 rounded-xl text-amber-600 text-[10px] font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Add Guest Admin Email
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          {!isAddingNew ? (
            <button 
              onClick={() => {
                setIsAddingNew(true);
                setEditingId(null); // Close any active editing if we're adding a new one
              }}
              className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add New Employee
            </button>
          ) : (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Add New Employee</h3>
                <button 
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-tighter"
                >
                  Hide Form
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Full Name</label>
                    <input 
                      required
                      type="text" 
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                      placeholder="e.g. Serge"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Google Email</label>
                    <input 
                      required
                      type="email" 
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                      placeholder="Required for access"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Weekly Target (h)</label>
                    <input 
                      type="number" 
                      value={newTargetHours}
                      onChange={(e) => setNewTargetHours(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Initial Role</label>
                    <select 
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as 'admin' | 'staff')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    >
                      <option value="staff">Regular Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">First Day on the Job</label>
                    <input
                      required
                      type="date"
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Last Day on the Job <span className="text-slate-400 normal-case font-medium">(leave empty if still employed)</span></label>
                    <input
                      type="date"
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">Brand Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="w-11 h-10 p-1 bg-white border border-slate-200 cursor-pointer rounded-xl overflow-hidden shadow-sm"
                      />
                      <input 
                        type="text" 
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 text-white font-black text-sm uppercase tracking-[0.15em] rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                  >
                    Add to Team
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffModal;