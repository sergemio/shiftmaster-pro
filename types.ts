
export type Language = 'en' | 'fr';

export interface Staff {
  id: string;
  name: string;
  email: string; // Added for RBAC mapping
  color: string;
  targetHours: number;
  role: 'admin' | 'staff';
  jobTitle?: string;
  startDate?: string; // YYYY-MM-DD, employment start
  endDate?: string | null; // YYYY-MM-DD or null = still employed (CDI)
}

export interface Shift {
  id: string;
  staffId: string;
  dayIndex: number; // 0 (Mon) to 6 (Sun)
  startTime: number; // Decimal hours (e.g., 9.5 = 09:30)
  endTime: number;
  coverageBy?: string; // staffId of someone covering
  notes?: string;
}

export type DragType = 'move' | 'resize-top' | 'resize-bottom';

export interface DragState {
  shiftId: string;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;
  originalDay: number;
  originalStart: number;
  originalEnd: number;
  dragType: DragType;
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
  /**
   * Who the entry is ABOUT (as opposed to userName, who did it). Absent on the
   * 3600+ entries written before this field existed — the journal falls back to
   * reading the name out of `details` for those.
   */
  targetStaffName?: string;
  targetStaffId?: string;
  /** Week the action touched, for future filtering. */
  weekId?: string;
}
