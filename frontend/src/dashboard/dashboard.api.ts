import { apiGet } from '@/api';
import type {
  DashboardDispatch,
  LearnerDashboard,
  SchoolDashboard,
  TeacherDashboard,
} from './dashboard.types';

/** Role-appropriate home-screen aggregates — one call each, built server-side. */

export function fetchDashboardDispatch(): Promise<DashboardDispatch> {
  return apiGet<DashboardDispatch>('/dashboard');
}

export function fetchLearnerDashboard(studentId?: string): Promise<LearnerDashboard> {
  return apiGet<LearnerDashboard>('/dashboard/learner', { params: { studentId } });
}

export function fetchTeacherDashboard(query?: { classId?: string; attentionLimit?: number }): Promise<TeacherDashboard> {
  return apiGet<TeacherDashboard>('/dashboard/teacher', { params: query });
}

export function fetchAttentionDashboard(): Promise<unknown> {
  return apiGet('/dashboard/attention');
}

export function fetchSchoolDashboard(): Promise<SchoolDashboard> {
  return apiGet<SchoolDashboard>('/dashboard/school');
}
