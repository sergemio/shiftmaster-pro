
export type Language = 'en' | 'fr';

export interface Settings {
  language: Language;
  timezone: string;
  viewType: 'day' | 'employee';
}

export interface Staff {
  id: string;
  name: string;
  email: string; // Added for RBAC mapping
  color: string;
  targetHours: number;
  role: 'admin' | 'staff';
  jobTitle?: string;
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

export interface WeeklyData {
  weekStart: string; // ISO string for the Monday
  shifts: Shift[];
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
}
