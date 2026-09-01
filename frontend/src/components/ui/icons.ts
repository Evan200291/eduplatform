/**
 * The icon set, named for what it means in Midas rather than what the library
 * calls it.
 *
 * One indirection, two payoffs: a lucide rename (v1 renamed `Loader2` to
 * `LoaderCircle`, `AlertTriangle` to `TriangleAlert`, and more) is a one-line fix
 * here instead of a sweep through every screen; and a reviewer can see the whole
 * visual vocabulary of the product in one file.
 */
export {
  // Status and feedback
  LoaderCircle as IconSpinner,
  TriangleAlert as IconWarning,
  CircleAlert as IconError,
  CircleCheck as IconSuccess,
  Info as IconInfo,
  WifiOff as IconOffline,
  RefreshCw as IconRetry,

  // Navigation and chrome
  House as IconHome,
  Menu as IconMenu,
  X as IconClose,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ChevronLeft as IconChevronLeft,
  ArrowLeft as IconBack,
  ArrowRight as IconForward,
  Search as IconSearch,
  Bell as IconNotifications,
  Settings as IconSettings,
  LogOut as IconSignOut,
  ExternalLink as IconExternal,
  EllipsisVertical as IconMore,
  CircleQuestionMark as IconHelp,

  // Learning
  BookOpen as IconLesson,
  ListChecks as IconActivity,
  Layers as IconCurriculum,
  Target as IconLearningPath,
  ClipboardList as IconAssignment,
  ClipboardCheck as IconAssessment,
  FileText as IconDocument,
  GraduationCap as IconGrade,
  Presentation as IconClass,
  TrendingUp as IconProgress,
  Play as IconStart,

  // Gamification
  Trophy as IconLeaderboard,
  Star as IconPoints,
  Award as IconBadge,
  Flame as IconStreak,
  Sparkles as IconCompanion,
  Flag as IconMission,
  Gamepad2 as IconGamification,

  // People and tenancy
  User as IconUser,
  Users as IconUsers,
  Building2 as IconOrganization,
  School as IconSchool,
  UserPlus as IconInvite,
  KeyRound as IconRoles,

  // Admin
  ChartColumn as IconReports,
  ChartPie as IconAnalytics,
  Palette as IconBranding,
  ShieldCheck as IconSafety,
  CreditCard as IconBilling,
  LifeBuoy as IconSupport,
  ToggleRight as IconFeatures,
  ScrollText as IconAudit,

  // Accessibility and preferences
  Accessibility as IconAccessibility,
  Contrast as IconContrast,
  Type as IconTextSize,
  Volume2 as IconSound,

  // Editing
  Plus as IconAdd,
  Pencil as IconEdit,
  Trash2 as IconDelete,
  Check as IconCheck,
  Eye as IconShow,
  EyeOff as IconHide,
  Clock as IconTime,
  Calendar as IconCalendar,
  Archive as IconArchive,
  ArchiveRestore as IconRestore,
  Save as IconSave,
  Send as IconSend,
  Download as IconDownload,
  Upload as IconUpload,
  Copy as IconCopy,
  Lock as IconLock,
  Mail as IconMail,
  ListFilter as IconFilter,
  RotateCcw as IconRollback,
} from 'lucide-react';

export type { LucideIcon } from 'lucide-react';
