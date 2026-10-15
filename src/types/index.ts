export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface Contact {
  id: number;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  activity: string | null;
  city: string | null;
  googleRating: number | null;
  googleReviews: number | null;
  hasSite: string | null;
  siteUrl: string | null;
  siteStatus: string | null;
  source: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  detailUrl: string | null;
  stage: string | null;
  assignedTo: number | null;
  objection: string | null;
  /** 1 when the business asked not to be called again. */
  dnc?: number | null;
  dncReason?: string | null;
  /** Set when the lead was archived instead of deleted; history is kept. */
  archivedAt?: string | number | Date | null;
  /** Calling history for the viewer: last call date, its result, and how many. */
  lastCallAt?: string | number | Date | null;
  lastCallResult?: string | null;
  callCount?: number;
  notes: string | null;
  /** 'de' | 'fr' | 'it' | 'en' | null. Detected, not declared by the business. */
  language?: string | null;
  languageSource?: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface Call {
  id: number;
  contactId: number | null;
  userId: number | null;
  date: number | null;
  duration: number | null;
  result: string;
  objection: string | null;
  notes: string | null;
  nextStep: string | null;
  /** Scheduled callback date. Null when the note has no date. */
  nextStepAt?: string | number | Date | null;
  /** Joined from the contact row by GET /calls and GET /calls/contact/:id. */
  businessName?: string | null;
}

export interface Deal {
  id: number;
  contactId: number | null;
  amount: number | null;
  siteType: string | null;
  status: string | null;
  assignedTo: number | null;
  createdAt: number | null;
  signedAt: number | null;
}

export interface Referral {
  id: number;
  sourceContactId: number | null;
  referredName: string | null;
  referredPhone: string | null;
  referredEmail: string | null;
  referredContactId: number | null;
  status: string | null;
  createdAt: number | null;
}

/** Effective window the server counted, echoed back so the UI never guesses. */
export interface ReportRange {
  from: string;
  to: string;
  label: string;
  days: number;
}

export interface DashboardSummary {
  range: ReportRange;
  contacts: { total: number };
  calls: {
    total: number;
    today: number;
    answered: number;
    meetings: number;
    connectionRate: number;
    meetingRate: number;
  };
  deals: {
    total: number;
    signed: number;
    revenue: number;
    openPipeline: number;
    closingRate: number;
  };
  referrals: {
    total: number;
    signed: number;
  };
}

export interface ObjectionBreakdown {
  range: ReportRange;
  total: number;
  objections: { objection: string; occurrences: number; share: number }[];
}

export interface FunnelStage {
  stage: string;
  count: number;
  /** Share of the previous stage still present here, or null for the first stage. */
  reachRate: number | null;
}

export interface PipelineData {
  identifie: number;
  contacte: number;
  interesse: number;
  rdv_programme: number;
  proposition_envoyee: number;
  signe: number;
  perdu: number;
}

export interface PerformanceData {
  userId: number;
  name: string;
  totalCalls: number;
  answeredCalls: number;
  rdvObtained: number;
  connectionRate: number;
  rdvRate: number;
}

export interface ActivityItem {
  id: number;
  contactId: number | null;
  date: number | null;
  result: string;
  notes: string | null;
  userName: string | null;
  contactName: string | null;
}

/** A lead whose scheduled callback is due or overdue. */
export interface DueFollowUp {
  id: number;
  contactId: number;
  callDate: string | number | Date | null;
  nextStep: string | null;
  nextStepAt: string | number | Date;
  businessName: string | null;
  city: string | null;
  phone: string | null;
  overdue: boolean;
}
