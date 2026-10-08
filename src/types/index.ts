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
  notes: string | null;
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

export interface DashboardSummary {
  contacts: { total: number };
  calls: {
    total: number;
    today: number;
    month: number;
    answered: number;
    connectionRate: number;
  };
  deals: {
    total: number;
    signed: number;
    monthRevenue: number;
    closingRate: number;
  };
  referrals: {
    total: number;
    signed: number;
  };
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
  date: number | null;
  result: string;
  notes: string | null;
  userName: string | null;
  contactName: string | null;
}
