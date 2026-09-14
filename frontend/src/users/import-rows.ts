/**
 * Turns rows read from a school's CSV into the calls the import screens make,
 * and says plainly what is wrong with any row that cannot be imported.
 *
 * PRD v2.5 names CSV import for students, teachers and classes. Students have a
 * bulk endpoint; staff and classes do not, so those screens call the ordinary
 * one-at-a-time routes (invitations, classes, class teachers) for each row.
 */

export const STAFF_ALIASES = {
  email: ['emailaddress', 'e-mail', 'mail', 'workemail'],
  role: ['roles', 'jobrole', 'position'],
} as const;

export const CLASS_ALIASES = {
  name: ['classname', 'class', 'title'],
  grade: ['yeargroup', 'year', 'gradename', 'level'],
  code: ['classcode', 'shortcode'],
  subjects: ['subject', 'subjectlist'],
  teacher: ['teacheremail', 'leadteacher', 'teachers'],
} as const;

/** School-level staff roles an admin can invite. Platform roles are left to Midas. */
const ROLE_WORDS: Record<string, string> = {
  teacher: 'TEACHER',
  schooladmin: 'SCHOOL_ADMIN',
  schooladministrator: 'SCHOOL_ADMIN',
  admin: 'SCHOOL_ADMIN',
  headteacher: 'SCHOOL_ADMIN',
  curriculummanager: 'CURRICULUM_MANAGER',
  contentreviewer: 'CONTENT_REVIEWER',
  reviewer: 'CONTENT_REVIEWER',
  reportviewer: 'REPORT_VIEWER',
  billingadmin: 'BILLING_ADMIN',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLASS_CODE = /^[A-Za-z0-9-]{2,40}$/;

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface StaffRowPlan {
  line: number;
  email: string;
  roleKey: string | null;
  problem: string | null;
}

export function planStaffRows(records: Partial<Record<'email' | 'role', string>>[]): StaffRowPlan[] {
  const seen = new Set<string>();
  return records.map((record, index) => {
    const line = index + 2; // the header is line 1
    const email = (record.email ?? '').trim().toLowerCase();
    const roleKey = record.role ? (ROLE_WORDS[squash(record.role)] ?? null) : 'TEACHER';
    let problem: string | null = null;
    if (!email) problem = 'No email address.';
    else if (!EMAIL.test(email)) problem = 'That does not look like an email address.';
    else if (seen.has(email)) problem = 'This email is already further up the file.';
    else if (!roleKey) problem = `Unknown role "${record.role}". Use Teacher, School admin, Curriculum manager or Content reviewer.`;
    if (email) seen.add(email);
    return { line, email, roleKey, problem };
  });
}

export interface ClassRowPlan {
  line: number;
  name: string;
  gradeId: string | null;
  gradeLabel: string;
  code: string | null;
  subjectIds: string[];
  subjectLabels: string[];
  teacherId: string | null;
  teacherLabel: string | null;
  problem: string | null;
}

interface Lookup {
  grades: { id: string; name: string; level: number }[];
  subjects: { id: string; name: string; key: string }[];
  teachers: { id: string; email: string | null; displayName: string }[];
}

export function planClassRows(
  records: Partial<Record<'name' | 'grade' | 'code' | 'subjects' | 'teacher', string>>[],
  lookup: Lookup,
): ClassRowPlan[] {
  const seenCodes = new Set<string>();
  return records.map((record, index) => {
    const line = index + 2;
    const name = (record.name ?? '').trim();
    const gradeText = (record.grade ?? '').trim();
    const grade =
      lookup.grades.find((g) => squash(g.name) === squash(gradeText)) ??
      lookup.grades.find((g) => String(g.level) === gradeText) ??
      null;
    const code = record.code?.trim() || null;

    const subjectWords = (record.subjects ?? '')
      .split(/[;|/]/)
      .map((word) => word.trim())
      .filter(Boolean);
    const subjects = subjectWords.map(
      (word) => lookup.subjects.find((s) => squash(s.name) === squash(word) || squash(s.key) === squash(word)) ?? null,
    );
    const unknownSubjects = subjectWords.filter((_, i) => subjects[i] === null);

    const teacherText = record.teacher?.trim().toLowerCase() || null;
    const teacher = teacherText ? (lookup.teachers.find((t) => t.email?.toLowerCase() === teacherText) ?? null) : null;

    let problem: string | null = null;
    if (!name) problem = 'No class name.';
    else if (name.length < 2) problem = 'Class names need at least two characters.';
    else if (!gradeText) problem = 'No grade or year group.';
    else if (!grade) problem = `No grade called "${gradeText}". Add it under Grades first, or fix the spelling.`;
    else if (code && !CLASS_CODE.test(code)) problem = 'Class codes use letters, numbers and hyphens only.';
    else if (code && seenCodes.has(code.toLowerCase())) problem = 'This class code is already further up the file.';
    else if (unknownSubjects.length > 0) problem = `Unknown subject: ${unknownSubjects.join(', ')}.`;
    else if (teacherText && !teacher) problem = `No teacher account with the email ${teacherText}. Invite them first.`;
    if (code) seenCodes.add(code.toLowerCase());

    return {
      line,
      name,
      gradeId: grade?.id ?? null,
      gradeLabel: grade?.name ?? gradeText,
      code,
      subjectIds: subjects.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => s.id),
      subjectLabels: subjects.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => s.name),
      teacherId: teacher?.id ?? null,
      teacherLabel: teacher?.displayName ?? null,
      problem,
    };
  });
}
