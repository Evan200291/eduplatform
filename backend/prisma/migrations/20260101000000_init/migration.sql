-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `status` ENUM('PROSPECT', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'PROSPECT',
    `contactName` VARCHAR(140) NULL,
    `contactEmail` VARCHAR(190) NULL,
    `contactPhone` VARCHAR(40) NULL,
    `country` VARCHAR(2) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
    `internalNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `suspendedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    INDEX `organizations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schools` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `code` VARCHAR(24) NOT NULL,
    `status` ENUM('PROSPECT', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'PROSPECT',
    `contactName` VARCHAR(140) NULL,
    `contactEmail` VARCHAR(190) NULL,
    `contactPhone` VARCHAR(40) NULL,
    `addressLine` VARCHAR(240) NULL,
    `city` VARCHAR(120) NULL,
    `country` VARCHAR(2) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
    `defaultAgeMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NOT NULL DEFAULT 'PRIMARY',
    `logoMediaId` VARCHAR(191) NULL,
    `primaryColor` VARCHAR(9) NOT NULL DEFAULT '#4F46E5',
    `secondaryColor` VARCHAR(9) NOT NULL DEFAULT '#0EA5E9',
    `accentColor` VARCHAR(9) NOT NULL DEFAULT '#F59E0B',
    `welcomeMessage` VARCHAR(500) NULL,
    `activeThemeId` VARCHAR(191) NULL,
    `onboardingStage` VARCHAR(60) NULL,
    `launchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `suspendedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    UNIQUE INDEX `schools_slug_key`(`slug`),
    UNIQUE INDEX `schools_code_key`(`code`),
    UNIQUE INDEX `schools_activeThemeId_key`(`activeThemeId`),
    INDEX `schools_organizationId_idx`(`organizationId`),
    INDEX `schools_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_settings` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `pointsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `badgesEnabled` BOOLEAN NOT NULL DEFAULT true,
    `streaksEnabled` BOOLEAN NOT NULL DEFAULT true,
    `companionEnabled` BOOLEAN NOT NULL DEFAULT true,
    `missionsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `leaderboardEnabled` BOOLEAN NOT NULL DEFAULT false,
    `leaderboardScope` ENUM('CLASS', 'GRADE', 'SUBJECT', 'COHORT', 'SCHOOL', 'EVENT') NOT NULL DEFAULT 'CLASS',
    `leaderboardIdentityMode` ENUM('REAL_NAME', 'NICKNAME', 'AVATAR_ONLY', 'ANONYMOUS_RANK') NOT NULL DEFAULT 'NICKNAME',
    `leaderboardRankingMode` ENUM('POINTS', 'MASTERY_GAIN', 'ACTIVITY_COUNT', 'PERSONAL_BEST', 'COOPERATIVE_TEAM') NOT NULL DEFAULT 'PERSONAL_BEST',
    `gamificationIntensity` INTEGER NOT NULL DEFAULT 60,
    `companionDecayEnabled` BOOLEAN NOT NULL DEFAULT false,
    `screeningEnabled` BOOLEAN NOT NULL DEFAULT true,
    `screeningMaxItems` INTEGER NOT NULL DEFAULT 24,
    `screeningTimeLimitMinutes` INTEGER NULL,
    `ongoingCheckFrequencyDays` INTEGER NOT NULL DEFAULT 14,
    `reassessmentCooldownDays` INTEGER NOT NULL DEFAULT 7,
    `allowStudentSelfReassess` BOOLEAN NOT NULL DEFAULT false,
    `recommendationApprovalRequired` BOOLEAN NOT NULL DEFAULT true,
    `recommendationAutoApproveHours` INTEGER NULL,
    `homeworkEnabled` BOOLEAN NOT NULL DEFAULT true,
    `defaultLateBehavior` ENUM('BLOCK_AFTER_DUE', 'ALLOW_LATE_FLAGGED', 'ALLOW_LATE_SILENT', 'ALLOW_UNTIL_GRACE_END') NOT NULL DEFAULT 'ALLOW_LATE_FLAGGED',
    `defaultGraceHours` INTEGER NOT NULL DEFAULT 24,
    `emailNotificationsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `pushNotificationsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `digestEnabled` BOOLEAN NOT NULL DEFAULT true,
    `quietHoursStart` INTEGER NULL,
    `quietHoursEnd` INTEGER NULL,
    `allowedLoginMethods` JSON NOT NULL,
    `studentPinRequired` BOOLEAN NOT NULL DEFAULT true,
    `studentCodeLength` INTEGER NOT NULL DEFAULT 8,
    `sessionIdleMinutes` INTEGER NOT NULL DEFAULT 120,
    `contentReportingEnabled` BOOLEAN NOT NULL DEFAULT true,
    `moderationRequired` BOOLEAN NOT NULL DEFAULT true,
    `allowStudentAvatarUpload` BOOLEAN NOT NULL DEFAULT false,
    `dataRetentionMonths` INTEGER NOT NULL DEFAULT 36,
    `parentPortalEnabled` BOOLEAN NOT NULL DEFAULT false,
    `extraSettings` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(32) NULL,

    UNIQUE INDEX `school_settings_schoolId_key`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `schoolId` VARCHAR(191) NULL,
    `plan` ENUM('PILOT', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE') NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'TRIALING',
    `interval` ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM') NOT NULL DEFAULT 'ANNUAL',
    `licensedStudentSeats` INTEGER NOT NULL DEFAULT 0,
    `licensedTeacherSeats` INTEGER NOT NULL DEFAULT 0,
    `pricePerStudentMinor` INTEGER NULL,
    `pricePerTeacherMinor` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GBP',
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `renewsAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `autoRenew` BOOLEAN NOT NULL DEFAULT true,
    `purchaseOrderRef` VARCHAR(80) NULL,
    `invoiceEmail` VARCHAR(190) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `subscriptions_organizationId_idx`(`organizationId`),
    INDEX `subscriptions_schoolId_idx`(`schoolId`),
    INDEX `subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_entitlements` (
    `id` VARCHAR(191) NOT NULL,
    `featureKey` VARCHAR(120) NOT NULL,
    `scopeType` ENUM('PLATFORM', 'PLAN', 'ORGANIZATION', 'SCHOOL', 'ROLE', 'GRADE', 'CLASS', 'SUBJECT', 'USER_GROUP') NOT NULL,
    `enabled` BOOLEAN NOT NULL,
    `value` JSON NULL,
    `organizationId` VARCHAR(32) NULL,
    `schoolId` VARCHAR(191) NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `plan` ENUM('PILOT', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE') NULL,
    `roleKey` ENUM('PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CURRICULUM_MANAGER', 'CONTENT_REVIEWER', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'REPORT_VIEWER') NULL,
    `gradeId` VARCHAR(191) NULL,
    `classId` VARCHAR(191) NULL,
    `subjectId` VARCHAR(191) NULL,
    `userGroupId` VARCHAR(191) NULL,
    `precedence` INTEGER NOT NULL DEFAULT 0,
    `reason` VARCHAR(300) NULL,
    `isSafetyRule` BOOLEAN NOT NULL DEFAULT false,
    `effectiveFrom` DATETIME(3) NULL,
    `effectiveTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `feature_entitlements_featureKey_scopeType_idx`(`featureKey`, `scopeType`),
    INDEX `feature_entitlements_schoolId_featureKey_idx`(`schoolId`, `featureKey`),
    INDEX `feature_entitlements_organizationId_featureKey_idx`(`organizationId`, `featureKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `themes` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `colorPrimary` VARCHAR(9) NOT NULL DEFAULT '#4F46E5',
    `colorSecondary` VARCHAR(9) NOT NULL DEFAULT '#0EA5E9',
    `colorAccent` VARCHAR(9) NOT NULL DEFAULT '#F59E0B',
    `colorSuccess` VARCHAR(9) NOT NULL DEFAULT '#16A34A',
    `colorWarning` VARCHAR(9) NOT NULL DEFAULT '#D97706',
    `colorDanger` VARCHAR(9) NOT NULL DEFAULT '#DC2626',
    `colorSurface` VARCHAR(9) NOT NULL DEFAULT '#FFFFFF',
    `colorBackground` VARCHAR(9) NOT NULL DEFAULT '#F6F7FB',
    `colorTextBody` VARCHAR(9) NOT NULL DEFAULT '#111827',
    `colorTextMuted` VARCHAR(9) NOT NULL DEFAULT '#6B7280',
    `fontHeading` VARCHAR(120) NOT NULL DEFAULT 'Inter',
    `fontBody` VARCHAR(120) NOT NULL DEFAULT 'Inter',
    `fontBaseSize` INTEGER NOT NULL DEFAULT 16,
    `radiusScale` VARCHAR(12) NOT NULL DEFAULT 'md',
    `densityScale` VARCHAR(16) NOT NULL DEFAULT 'comfortable',
    `reduceMotion` BOOLEAN NOT NULL DEFAULT false,
    `highContrast` BOOLEAN NOT NULL DEFAULT false,
    `tokens` JSON NULL,
    `logoMediaId` VARCHAR(191) NULL,
    `faviconMediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `themes_status_idx`(`status`),
    UNIQUE INDEX `themes_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `theme_versions` (
    `id` VARCHAR(191) NOT NULL,
    `themeId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `tokens` JSON NOT NULL,
    `changeSummary` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    UNIQUE INDEX `theme_versions_themeId_version_key`(`themeId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `schoolId` VARCHAR(191) NULL,
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED') NOT NULL DEFAULT 'INVITED',
    `primaryRole` ENUM('PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CURRICULUM_MANAGER', 'CONTENT_REVIEWER', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'REPORT_VIEWER') NOT NULL,
    `email` VARCHAR(190) NULL,
    `username` VARCHAR(80) NULL,
    `studentCode` VARCHAR(32) NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `displayName` VARCHAR(160) NOT NULL,
    `nickname` VARCHAR(60) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `locale` VARCHAR(16) NULL,
    `timezone` VARCHAR(64) NULL,
    `avatarMediaId` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NULL,
    `pinHash` VARCHAR(255) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginMethod` ENUM('EMAIL_PASSWORD', 'USERNAME_PASSWORD', 'STUDENT_CODE', 'STUDENT_CODE_PIN') NULL,
    `emailVerifiedAt` DATETIME(3) NULL,
    `termsAcceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `suspendedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `users_organizationId_idx`(`organizationId`),
    INDEX `users_primaryRole_idx`(`primaryRole`),
    UNIQUE INDEX `users_schoolId_studentCode_key`(`schoolId`, `studentCode`),
    UNIQUE INDEX `users_schoolId_username_key`(`schoolId`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `currentGradeId` VARCHAR(191) NULL,
    `onboardingCompletedAt` DATETIME(3) NULL,
    `screeningCompletedAt` DATETIME(3) NULL,
    `placementSummary` VARCHAR(500) NULL,
    `fontScale` INTEGER NOT NULL DEFAULT 100,
    `dyslexiaFont` BOOLEAN NOT NULL DEFAULT false,
    `reduceMotion` BOOLEAN NOT NULL DEFAULT false,
    `highContrast` BOOLEAN NOT NULL DEFAULT false,
    `audioSupport` BOOLEAN NOT NULL DEFAULT false,
    `captionsPreferred` BOOLEAN NOT NULL DEFAULT false,
    `supportNotes` TEXT NULL,
    `targetMinutesPerWeek` INTEGER NOT NULL DEFAULT 60,
    `guardianEmail` VARCHAR(190) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `student_profiles_userId_key`(`userId`),
    INDEX `student_profiles_currentGradeId_idx`(`currentGradeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roleKey` ENUM('PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CURRICULUM_MANAGER', 'CONTENT_REVIEWER', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'REPORT_VIEWER') NOT NULL,
    `scopeType` ENUM('PLATFORM', 'ORGANIZATION', 'SCHOOL', 'GRADE', 'CLASS', 'SUBJECT') NOT NULL,
    `organizationId` VARCHAR(32) NULL,
    `schoolId` VARCHAR(191) NULL,
    `gradeId` VARCHAR(191) NULL,
    `classId` VARCHAR(191) NULL,
    `subjectId` VARCHAR(191) NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `grantedById` VARCHAR(32) NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(32) NULL,
    `reason` VARCHAR(300) NULL,
    `scopeKey` VARCHAR(140) NOT NULL DEFAULT '',

    INDEX `user_role_assignments_schoolId_roleKey_idx`(`schoolId`, `roleKey`),
    INDEX `user_role_assignments_userId_idx`(`userId`),
    UNIQUE INDEX `user_role_scope_unique`(`userId`, `roleKey`, `scopeType`, `scopeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `refreshTokenHash` VARCHAR(255) NOT NULL,
    `loginMethod` ENUM('EMAIL_PASSWORD', 'USERNAME_PASSWORD', 'STUDENT_CODE', 'STUDENT_CODE_PIN') NOT NULL,
    `activeSchoolId` VARCHAR(32) NULL,
    `activeOrganizationId` VARCHAR(32) NULL,
    `userAgent` VARCHAR(400) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedBySessionId` VARCHAR(32) NULL,

    UNIQUE INDEX `sessions_refreshTokenHash_key`(`refreshTokenHash`),
    INDEX `sessions_userId_idx`(`userId`),
    INDEX `sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `organizationId` VARCHAR(32) NULL,
    `email` VARCHAR(190) NOT NULL,
    `roleKey` ENUM('PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CURRICULUM_MANAGER', 'CONTENT_REVIEWER', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'REPORT_VIEWER') NOT NULL,
    `scopeType` ENUM('PLATFORM', 'ORGANIZATION', 'SCHOOL', 'GRADE', 'CLASS', 'SUBJECT') NOT NULL DEFAULT 'SCHOOL',
    `status` ENUM('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `tokenHash` VARCHAR(255) NOT NULL,
    `message` VARCHAR(500) NULL,
    `invitedById` VARCHAR(191) NULL,
    `acceptedById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `invitations_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `invitations_acceptedById_key`(`acceptedById`),
    INDEX `invitations_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `invitations_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_groups` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(32) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `user_groups_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `user_groups_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_group_members` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `addedById` VARCHAR(32) NULL,

    INDEX `user_group_members_userId_idx`(`userId`),
    UNIQUE INDEX `user_group_members_groupId_userId_key`(`groupId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `grades` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `level` INTEGER NOT NULL,
    `typicalAgeFrom` INTEGER NULL,
    `typicalAgeTo` INTEGER NULL,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `grades_schoolId_level_idx`(`schoolId`, `level`),
    UNIQUE INDEX `grades_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_terms` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academic_terms_schoolId_isCurrent_idx`(`schoolId`, `isCurrent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `description` VARCHAR(500) NULL,
    `colorHex` VARCHAR(9) NULL,
    `iconKey` VARCHAR(60) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `subjects_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `subjects_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NOT NULL,
    `academicTermId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `description` VARCHAR(500) NULL,
    `capacity` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `classes_schoolId_gradeId_idx`(`schoolId`, `gradeId`),
    UNIQUE INDEX `classes_schoolId_code_key`(`schoolId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_subjects` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `weeklyMinutes` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `class_subjects_subjectId_idx`(`subjectId`),
    UNIQUE INDEX `class_subjects_classId_subjectId_key`(`classId`, `subjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_memberships` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `addedById` VARCHAR(32) NULL,

    INDEX `class_memberships_userId_isActive_idx`(`userId`, `isActive`),
    UNIQUE INDEX `class_memberships_classId_userId_key`(`classId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_teachers` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT false,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,

    INDEX `class_teachers_userId_idx`(`userId`),
    UNIQUE INDEX `class_teacher_subject_unique`(`classId`, `userId`, `subjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `curriculum_programs` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NULL,
    `name` VARCHAR(180) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `framework` VARCHAR(180) NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `ownership` ENUM('MIDAS_ORIGINAL', 'SCHOOL_OWNED', 'SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED', 'CO_CREATED') NOT NULL DEFAULT 'MIDAS_ORIGINAL',
    `version` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `curriculum_programs_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `curriculum_programs_schoolId_subjectId_key_key`(`schoolId`, `subjectId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `programId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `units_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `units_programId_key_key`(`programId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topics` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NULL,
    `name` VARCHAR(180) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `estimatedMinutes` INTEGER NOT NULL DEFAULT 20,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `masteryThreshold` INTEGER NOT NULL DEFAULT 80,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `topics_schoolId_subjectId_idx`(`schoolId`, `subjectId`),
    INDEX `topics_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `topics_unitId_key_key`(`unitId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topic_prerequisites` (
    `id` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `requiredTopicId` VARCHAR(191) NOT NULL,
    `isHard` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `topic_prerequisites_requiredTopicId_idx`(`requiredTopicId`),
    UNIQUE INDEX `topic_prerequisites_topicId_requiredTopicId_key`(`topicId`, `requiredTopicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_objectives` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `statement` VARCHAR(600) NOT NULL,
    `notes` TEXT NULL,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `learning_objectives_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `learning_objectives_topicId_code_key`(`topicId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lessons` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `summary` VARCHAR(600) NULL,
    `body` TEXT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `ownership` ENUM('MIDAS_ORIGINAL', 'SCHOOL_OWNED', 'SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED', 'CO_CREATED') NOT NULL DEFAULT 'MIDAS_ORIGINAL',
    `version` INTEGER NOT NULL DEFAULT 1,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `estimatedMinutes` INTEGER NOT NULL DEFAULT 15,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `requiresAudio` BOOLEAN NOT NULL DEFAULT false,
    `heroMediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,
    `updatedById` VARCHAR(32) NULL,

    INDEX `lessons_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `lessons_subjectId_idx`(`subjectId`),
    UNIQUE INDEX `lessons_topicId_key_key`(`topicId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_sections` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `heading` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `kind` ENUM('EXPLANATION', 'WORKED_EXAMPLE', 'MULTIPLE_CHOICE', 'NUMERIC_RESPONSE', 'TRUE_FALSE', 'MATCHING', 'SORTING', 'PRACTICE_SEQUENCE', 'MINI_GAME', 'QUIZ', 'TEACHER_TASK') NOT NULL DEFAULT 'EXPLANATION',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `mediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lesson_sections_lessonId_sortOrder_idx`(`lessonId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `type` ENUM('EXPLANATION', 'WORKED_EXAMPLE', 'MULTIPLE_CHOICE', 'NUMERIC_RESPONSE', 'TRUE_FALSE', 'MATCHING', 'SORTING', 'PRACTICE_SEQUENCE', 'MINI_GAME', 'QUIZ', 'TEACHER_TASK') NOT NULL,
    `instructions` TEXT NULL,
    `config` JSON NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `ownership` ENUM('MIDAS_ORIGINAL', 'SCHOOL_OWNED', 'SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED', 'CO_CREATED') NOT NULL DEFAULT 'MIDAS_ORIGINAL',
    `currentVersion` INTEGER NOT NULL DEFAULT 1,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `estimatedMinutes` INTEGER NOT NULL DEFAULT 10,
    `pointsValue` INTEGER NOT NULL DEFAULT 10,
    `maxAttempts` INTEGER NULL,
    `passThreshold` INTEGER NOT NULL DEFAULT 70,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `screeningEligible` BOOLEAN NOT NULL DEFAULT false,
    `thumbnailMediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,
    `updatedById` VARCHAR(32) NULL,

    INDEX `activities_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `activities_subjectId_type_idx`(`subjectId`, `type`),
    UNIQUE INDEX `activities_topicId_key_key`(`topicId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_versions` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `snapshot` JSON NOT NULL,
    `changeSummary` VARCHAR(500) NULL,
    `invalidatesPriorEvidence` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    UNIQUE INDEX `activity_versions_activityId_version_key`(`activityId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_objectives` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `objectiveId` VARCHAR(191) NOT NULL,
    `weight` INTEGER NOT NULL DEFAULT 100,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_objectives_objectiveId_idx`(`objectiveId`),
    UNIQUE INDEX `activity_objectives_activityId_objectiveId_key`(`activityId`, `objectiveId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `objectiveId` VARCHAR(191) NULL,
    `type` ENUM('MULTIPLE_CHOICE', 'NUMERIC', 'TRUE_FALSE', 'MATCHING', 'SORTING', 'SHORT_TEXT') NOT NULL,
    `prompt` TEXT NOT NULL,
    `explanation` TEXT NULL,
    `config` JSON NULL,
    `promptMediaId` VARCHAR(191) NULL,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `pointsValue` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `timeLimitSeconds` INTEGER NULL,
    `correctNumeric` DECIMAL(18, 6) NULL,
    `numericTolerance` DECIMAL(18, 6) NULL,
    `correctBoolean` BOOLEAN NULL,
    `correctText` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `questions_activityId_sortOrder_idx`(`activityId`, `sortOrder`),
    INDEX `questions_objectiveId_idx`(`objectiveId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `answer_options` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(600) NOT NULL,
    `isCorrect` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `feedback` VARCHAR(600) NULL,
    `matchKey` VARCHAR(120) NULL,
    `mediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `answer_options_questionId_sortOrder_idx`(`questionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hints` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `pointsCost` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hints_questionId_sortOrder_idx`(`questionId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `kind` ENUM('IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'ANIMATION', 'ARCHIVE') NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `originalFileName` VARCHAR(255) NULL,
    `storageKey` VARCHAR(500) NOT NULL,
    `mimeType` VARCHAR(140) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `checksumSha256` VARCHAR(64) NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `durationSeconds` INTEGER NULL,
    `altText` VARCHAR(500) NULL,
    `caption` VARCHAR(500) NULL,
    `transcript` TEXT NULL,
    `ownership` ENUM('MIDAS_ORIGINAL', 'SCHOOL_OWNED', 'SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED', 'CO_CREATED') NOT NULL DEFAULT 'MIDAS_ORIGINAL',
    `licenseNote` VARCHAR(500) NULL,
    `attribution` VARCHAR(300) NULL,
    `moderationDecision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'REMOVED') NOT NULL DEFAULT 'PENDING',
    `moderatedAt` DATETIME(3) NULL,
    `moderatedById` VARCHAR(32) NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `media_assets_storageKey_key`(`storageKey`),
    INDEX `media_assets_schoolId_kind_idx`(`schoolId`, `kind`),
    INDEX `media_assets_moderationDecision_idx`(`moderationDecision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_ownership_records` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(40) NOT NULL,
    `targetId` VARCHAR(32) NOT NULL,
    `ownership` ENUM('MIDAS_ORIGINAL', 'SCHOOL_OWNED', 'SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED', 'CO_CREATED') NOT NULL,
    `licenseHolder` VARCHAR(200) NULL,
    `licenseReference` VARCHAR(200) NULL,
    `licenseStartsAt` DATETIME(3) NULL,
    `licenseEndsAt` DATETIME(3) NULL,
    `canRedistribute` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `content_ownership_records_schoolId_ownership_idx`(`schoolId`, `ownership`),
    UNIQUE INDEX `content_ownership_records_targetType_targetId_key`(`targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_publications` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'APPROVED',
    `changeSummary` VARCHAR(500) NULL,
    `reviewNotes` TEXT NULL,
    `reviewedById` VARCHAR(32) NULL,
    `publishedById` VARCHAR(32) NULL,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `retiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `content_publications_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `content_publications_lessonId_idx`(`lessonId`),
    INDEX `content_publications_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_reports` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `targetType` VARCHAR(40) NULL,
    `targetId` VARCHAR(32) NULL,
    `reason` ENUM('FACTUAL_ERROR', 'INAPPROPRIATE_CONTENT', 'BROKEN_ACTIVITY', 'WRONG_ANSWER_KEY', 'AGE_UNSUITABLE', 'COPYRIGHT_CONCERN', 'OTHER') NOT NULL,
    `details` TEXT NULL,
    `decision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'REMOVED') NOT NULL DEFAULT 'PENDING',
    `resolutionNotes` TEXT NULL,
    `resolvedById` VARCHAR(32) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `content_reports_schoolId_decision_idx`(`schoolId`, `decision`),
    INDEX `content_reports_reporterId_idx`(`reporterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_moderation_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NULL,
    `targetType` VARCHAR(40) NOT NULL,
    `targetId` VARCHAR(32) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `decision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'REMOVED') NOT NULL,
    `notes` TEXT NULL,
    `escalatedToId` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `content_moderation_reviews_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `content_moderation_reviews_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `kind` ENUM('SCREENING', 'ONGOING_CHECK', 'TOPIC_CHECK', 'REASSESSMENT', 'TEACHER_ASSIGNED') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `itemTarget` INTEGER NULL,
    `timeLimitMinutes` INTEGER NULL,
    `adaptiveEnabled` BOOLEAN NOT NULL DEFAULT true,
    `startingBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `passThreshold` INTEGER NOT NULL DEFAULT 70,
    `maxAttempts` INTEGER NULL,
    `cooldownDays` INTEGER NULL,
    `driveRecommendations` BOOLEAN NOT NULL DEFAULT true,
    `shuffleItems` BOOLEAN NOT NULL DEFAULT true,
    `showFeedbackImmediately` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `assessments_schoolId_kind_status_idx`(`schoolId`, `kind`, `status`),
    INDEX `assessments_subjectId_idx`(`subjectId`),
    UNIQUE INDEX `assessments_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_items` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `weight` INTEGER NOT NULL DEFAULT 100,
    `isAdaptiveEntry` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assessment_items_assessmentId_sortOrder_idx`(`assessmentId`, `sortOrder`),
    UNIQUE INDEX `assessment_items_assessmentId_activityId_key`(`assessmentId`, `activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `activityVersionId` VARCHAR(191) NULL,
    `attemptNumber` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'ABANDONED', 'EXPIRED') NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `scoreRaw` DECIMAL(10, 2) NULL,
    `scoreMax` DECIMAL(10, 2) NULL,
    `scorePercent` INTEGER NULL,
    `itemsPresented` INTEGER NOT NULL DEFAULT 0,
    `itemsCorrect` INTEGER NOT NULL DEFAULT 0,
    `timeSpentSeconds` INTEGER NOT NULL DEFAULT 0,
    `highestBandPassed` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NULL,
    `outcomeSummary` VARCHAR(600) NULL,
    `isPractice` BOOLEAN NOT NULL DEFAULT false,
    `deviceInfo` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assessment_attempts_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `assessment_attempts_studentId_completedAt_idx`(`studentId`, `completedAt`),
    UNIQUE INDEX `assessment_attempt_number_unique`(`assessmentId`, `studentId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_responses` (
    `id` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `activityVersionId` VARCHAR(191) NULL,
    `studentId` VARCHAR(32) NOT NULL,
    `schoolId` VARCHAR(32) NOT NULL,
    `response` JSON NOT NULL,
    `isCorrect` BOOLEAN NULL,
    `pointsAwarded` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pointsPossible` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `hintsUsed` INTEGER NOT NULL DEFAULT 0,
    `attemptsUsed` INTEGER NOT NULL DEFAULT 1,
    `timeSpentSeconds` INTEGER NOT NULL DEFAULT 0,
    `difficultyBand` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `teacherOverridden` BOOLEAN NOT NULL DEFAULT false,
    `teacherOverrideNote` VARCHAR(500) NULL,
    `overriddenById` VARCHAR(32) NULL,
    `overriddenAt` DATETIME(3) NULL,
    `answeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `student_responses_attemptId_idx`(`attemptId`),
    INDEX `student_responses_studentId_answeredAt_idx`(`studentId`, `answeredAt`),
    INDEX `student_responses_schoolId_activityId_idx`(`schoolId`, `activityId`),
    INDEX `student_responses_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topic_evaluations` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `attemptId` VARCHAR(191) NULL,
    `band` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL,
    `masteryLevel` ENUM('NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'MASTERED') NOT NULL DEFAULT 'NOT_ASSESSED',
    `accuracyPercent` INTEGER NOT NULL,
    `itemsConsidered` INTEGER NOT NULL DEFAULT 0,
    `evidenceSource` ENUM('SYSTEM_ASSESSMENT', 'PRACTICE_ACTIVITY', 'ASSIGNMENT_COMPLETION', 'TEACHER_JUDGMENT') NOT NULL,
    `confidence` ENUM('INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH') NOT NULL DEFAULT 'LOW',
    `notes` VARCHAR(600) NULL,
    `evaluatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `supersededAt` DATETIME(3) NULL,

    INDEX `topic_evaluations_schoolId_topicId_idx`(`schoolId`, `topicId`),
    INDEX `topic_evaluations_studentId_topicId_evaluatedAt_idx`(`studentId`, `topicId`, `evaluatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_paths` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `mode` ENUM('GRADE_BASED', 'SUBJECT_BASED', 'TOPIC_BASED', 'HYBRID') NOT NULL DEFAULT 'HYBRID',
    `name` VARCHAR(180) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `requiresApproval` BOOLEAN NOT NULL DEFAULT true,
    `approvedById` VARCHAR(32) NULL,
    `approvedAt` DATETIME(3) NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `generatorNote` VARCHAR(600) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `learning_paths_schoolId_subjectId_idx`(`schoolId`, `subjectId`),
    INDEX `learning_paths_studentId_isActive_idx`(`studentId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_path_items` (
    `id` VARCHAR(191) NOT NULL,
    `pathId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `lessonId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `assessmentId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'REMOVED_BY_TEACHER') NOT NULL DEFAULT 'LOCKED',
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `addedByTeacherId` VARCHAR(32) NULL,
    `removedByTeacherId` VARCHAR(32) NULL,
    `removedAt` DATETIME(3) NULL,
    `reason` VARCHAR(400) NULL,
    `unlockedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `learning_path_items_pathId_sortOrder_idx`(`pathId`, `sortOrder`),
    INDEX `learning_path_items_topicId_idx`(`topicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recommendations` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `topicId` VARCHAR(191) NULL,
    `pathId` VARCHAR(191) NULL,
    `assessmentId` VARCHAR(191) NULL,
    `attemptId` VARCHAR(191) NULL,
    `origin` ENUM('SCREENING_ASSESSMENT', 'ONGOING_EVIDENCE', 'TEACHER_REQUEST', 'REASSESSMENT', 'SCHEDULED_REVIEW') NOT NULL,
    `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'MODIFIED', 'REJECTED', 'DEFERRED', 'AUTO_APPROVED', 'SUPERSEDED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `rationale` TEXT NOT NULL,
    `proposal` JSON NOT NULL,
    `appliedChange` JSON NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `evidenceSource` ENUM('SYSTEM_ASSESSMENT', 'PRACTICE_ACTIVITY', 'ASSIGNMENT_COMPLETION', 'TEACHER_JUDGMENT') NOT NULL DEFAULT 'SYSTEM_ASSESSMENT',
    `confidence` ENUM('INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH') NOT NULL DEFAULT 'MODERATE',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(600) NULL,
    `autoApproveAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `recommendations_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `recommendations_studentId_status_idx`(`studentId`, `status`),
    INDEX `recommendations_decidedById_idx`(`decidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progress_records` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `lessonId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `status` ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'REMOVED_BY_TEACHER') NOT NULL DEFAULT 'IN_PROGRESS',
    `completionPercent` INTEGER NOT NULL DEFAULT 0,
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `bestScorePercent` INTEGER NULL,
    `lastScorePercent` INTEGER NULL,
    `timeSpentSeconds` INTEGER NOT NULL DEFAULT 0,
    `hintsUsed` INTEGER NOT NULL DEFAULT 0,
    `firstStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `progress_records_schoolId_lastActivityAt_idx`(`schoolId`, `lastActivityAt`),
    INDEX `progress_records_studentId_topicId_idx`(`studentId`, `topicId`),
    INDEX `progress_records_lessonId_idx`(`lessonId`),
    UNIQUE INDEX `progress_student_activity_unique`(`studentId`, `activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mastery_records` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NULL,
    `objectiveId` VARCHAR(191) NULL,
    `level` ENUM('NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'MASTERED') NOT NULL DEFAULT 'NOT_ASSESSED',
    `band` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NOT NULL DEFAULT 'DEVELOPING',
    `scorePercent` INTEGER NULL,
    `evidenceSource` ENUM('SYSTEM_ASSESSMENT', 'PRACTICE_ACTIVITY', 'ASSIGNMENT_COMPLETION', 'TEACHER_JUDGMENT') NOT NULL,
    `confidence` ENUM('INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH') NOT NULL DEFAULT 'LOW',
    `evidenceCount` INTEGER NOT NULL DEFAULT 0,
    `teacherOverride` BOOLEAN NOT NULL DEFAULT false,
    `overrideNote` VARCHAR(600) NULL,
    `overriddenById` VARCHAR(32) NULL,
    `firstEvidenceAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastEvidenceAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `masteredAt` DATETIME(3) NULL,
    `reviewDueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `mastery_records_schoolId_subjectId_level_idx`(`schoolId`, `subjectId`, `level`),
    INDEX `mastery_records_studentId_lastEvidenceAt_idx`(`studentId`, `lastEvidenceAt`),
    UNIQUE INDEX `mastery_student_target_unique`(`studentId`, `topicId`, `objectiveId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_assessments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `teacherId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `topicId` VARCHAR(191) NULL,
    `level` ENUM('NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'MASTERED') NOT NULL,
    `band` ENUM('FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION') NULL,
    `comment` TEXT NULL,
    `countsAsEvidence` BOOLEAN NOT NULL DEFAULT true,
    `assessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `teacher_assessments_schoolId_studentId_idx`(`schoolId`, `studentId`),
    INDEX `teacher_assessments_teacherId_assessedAt_idx`(`teacherId`, `assessedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teacher_notes` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `kind` ENUM('OBSERVATION', 'INTERVENTION', 'ASSESSMENT_JUDGMENT', 'PARENT_COMMUNICATION', 'ADMINISTRATIVE') NOT NULL DEFAULT 'OBSERVATION',
    `visibility` ENUM('PRIVATE_TEACHER', 'AUTHORIZED_STAFF', 'SCHOOL_RECORD', 'PARENT_VISIBLE') NOT NULL DEFAULT 'PRIVATE_TEACHER',
    `sensitivity` ENUM('ROUTINE', 'SENSITIVE', 'SAFEGUARDING') NOT NULL DEFAULT 'ROUTINE',
    `title` VARCHAR(200) NULL,
    `body` TEXT NOT NULL,
    `followUpDueAt` DATETIME(3) NULL,
    `followUpDoneAt` DATETIME(3) NULL,
    `escalatedAt` DATETIME(3) NULL,
    `escalatedToId` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `withdrawnById` VARCHAR(32) NULL,
    `withdrawReason` VARCHAR(400) NULL,

    INDEX `teacher_notes_schoolId_studentId_idx`(`schoolId`, `studentId`),
    INDEX `teacher_notes_authorId_createdAt_idx`(`authorId`, `createdAt`),
    INDEX `teacher_notes_visibility_sensitivity_idx`(`visibility`, `sensitivity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignments` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NULL,
    `subjectId` VARCHAR(191) NULL,
    `termId` VARCHAR(191) NULL,
    `kind` ENUM('LESSON', 'ACTIVITY', 'QUIZ', 'ASSESSMENT', 'MISSION', 'HOMEWORK', 'TASK') NOT NULL DEFAULT 'HOMEWORK',
    `title` VARCHAR(200) NOT NULL,
    `instructions` TEXT NULL,
    `topicId` VARCHAR(191) NULL,
    `lessonId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `assessmentId` VARCHAR(191) NULL,
    `availableFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueAt` DATETIME(3) NULL,
    `lateBehavior` ENUM('BLOCK_AFTER_DUE', 'ALLOW_LATE_FLAGGED', 'ALLOW_LATE_SILENT', 'ALLOW_UNTIL_GRACE_END') NOT NULL DEFAULT 'ALLOW_LATE_FLAGGED',
    `graceHours` INTEGER NOT NULL DEFAULT 24,
    `allowResubmission` BOOLEAN NOT NULL DEFAULT true,
    `maxAttempts` INTEGER NULL,
    `pointsValue` INTEGER NOT NULL DEFAULT 0,
    `estimatedMinutes` INTEGER NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `notifyOnAssign` BOOLEAN NOT NULL DEFAULT true,
    `notifyOnDueSoon` BOOLEAN NOT NULL DEFAULT true,
    `notifyOnOverdue` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `assignments_schoolId_isPublished_dueAt_idx`(`schoolId`, `isPublished`, `dueAt`),
    INDEX `assignments_classId_dueAt_idx`(`classId`, `dueAt`),
    INDEX `assignments_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_targets` (
    `id` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('STUDENT', 'GROUP', 'CLASS', 'GRADE', 'SUBJECT') NOT NULL,
    `targetId` VARCHAR(32) NOT NULL,
    `targetLabel` VARCHAR(180) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assignment_targets_targetType_targetId_idx`(`targetType`, `targetId`),
    UNIQUE INDEX `assignment_target_unique`(`assignmentId`, `targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assignment_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `state` ENUM('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'OVERDUE', 'EXCUSED') NOT NULL DEFAULT 'NOT_STARTED',
    `attemptNumber` INTEGER NOT NULL DEFAULT 1,
    `startedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `isLate` BOOLEAN NOT NULL DEFAULT false,
    `scorePercent` INTEGER NULL,
    `pointsAwarded` INTEGER NOT NULL DEFAULT 0,
    `timeSpentSeconds` INTEGER NOT NULL DEFAULT 0,
    `assessmentAttemptId` VARCHAR(32) NULL,
    `excusedById` VARCHAR(32) NULL,
    `excusedAt` DATETIME(3) NULL,
    `excusedReason` VARCHAR(400) NULL,
    `teacherFeedback` TEXT NULL,
    `feedbackById` VARCHAR(32) NULL,
    `feedbackAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assignment_attempts_schoolId_state_idx`(`schoolId`, `state`),
    INDEX `assignment_attempts_studentId_state_idx`(`studentId`, `state`),
    UNIQUE INDEX `assignment_attempt_unique`(`assignmentId`, `studentId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `points_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `reason` ENUM('ACTIVITY_COMPLETION', 'LESSON_COMPLETION', 'ASSESSMENT_COMPLETION', 'ASSIGNMENT_COMPLETION', 'MISSION_COMPLETION', 'MASTERY_MILESTONE', 'STREAK_BONUS', 'BADGE_AWARD', 'TEACHER_AWARD', 'ONBOARDING_COMPLETION', 'MANUAL_ADJUSTMENT', 'REVERSAL') NOT NULL,
    `points` INTEGER NOT NULL,
    `sourceType` VARCHAR(40) NULL,
    `sourceId` VARCHAR(32) NULL,
    `note` VARCHAR(400) NULL,
    `reversedAt` DATETIME(3) NULL,
    `reversedById` VARCHAR(32) NULL,
    `reversesEntryId` VARCHAR(32) NULL,
    `awardedById` VARCHAR(32) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `points_ledger_studentId_occurredAt_idx`(`studentId`, `occurredAt`),
    INDEX `points_ledger_schoolId_occurredAt_idx`(`schoolId`, `occurredAt`),
    INDEX `points_ledger_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `tier` ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'SPECIAL') NOT NULL DEFAULT 'BRONZE',
    `pointsValue` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `recognisesEffort` BOOLEAN NOT NULL DEFAULT false,
    `criteria` JSON NOT NULL,
    `criteriaLabel` VARCHAR(300) NOT NULL,
    `iconMediaId` VARCHAR(191) NULL,
    `iconKey` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `badges_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `badges_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_badges` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `badgeId` VARCHAR(191) NOT NULL,
    `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `awardedById` VARCHAR(32) NULL,
    `reason` VARCHAR(400) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(32) NULL,
    `seenAt` DATETIME(3) NULL,

    INDEX `student_badges_schoolId_awardedAt_idx`(`schoolId`, `awardedAt`),
    UNIQUE INDEX `student_badges_studentId_badgeId_key`(`studentId`, `badgeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `streaks` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DAILY_LEARNING', 'WEEKLY_LEARNING', 'ASSIGNMENT_ON_TIME', 'ACCURACY') NOT NULL,
    `currentLength` INTEGER NOT NULL DEFAULT 0,
    `longestLength` INTEGER NOT NULL DEFAULT 0,
    `lastQualifiedOn` DATETIME(3) NULL,
    `startedOn` DATETIME(3) NULL,
    `atRiskNotifiedAt` DATETIME(3) NULL,
    `freezesRemaining` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `streaks_schoolId_kind_idx`(`schoolId`, `kind`),
    UNIQUE INDEX `streaks_studentId_kind_key`(`studentId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rewards` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(500) NULL,
    `kind` ENUM('COSMETIC_ITEM', 'COMPANION_ACCESSORY', 'AVATAR_ITEM', 'THEME_UNLOCK', 'CERTIFICATE', 'TEACHER_RECOGNITION') NOT NULL,
    `pointsCost` INTEGER NOT NULL DEFAULT 0,
    `payload` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `previewMediaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,

    INDEX `rewards_schoolId_isActive_idx`(`schoolId`, `isActive`),
    UNIQUE INDEX `rewards_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_rewards` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `rewardId` VARCHAR(191) NOT NULL,
    `unlockedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isEquipped` BOOLEAN NOT NULL DEFAULT false,
    `equippedAt` DATETIME(3) NULL,
    `pointsSpent` INTEGER NOT NULL DEFAULT 0,
    `grantedById` VARCHAR(32) NULL,

    INDEX `student_rewards_schoolId_unlockedAt_idx`(`schoolId`, `unlockedAt`),
    UNIQUE INDEX `student_rewards_studentId_rewardId_key`(`studentId`, `rewardId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `missions` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NULL,
    `topicId` VARCHAR(191) NULL,
    `title` VARCHAR(180) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(600) NOT NULL,
    `ageMode` ENUM('EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'ADULT') NULL,
    `goalType` VARCHAR(40) NOT NULL,
    `goalTarget` INTEGER NOT NULL,
    `pointsReward` INTEGER NOT NULL DEFAULT 0,
    `rewardBadgeId` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endsAt` DATETIME(3) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `recurrenceDays` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `autoEnrol` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `missions_schoolId_isActive_idx`(`schoolId`, `isActive`),
    INDEX `missions_classId_idx`(`classId`),
    UNIQUE INDEX `missions_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mission_progress` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `missionId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_STARTED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'NOT_STARTED',
    `progressValue` INTEGER NOT NULL DEFAULT 0,
    `goalTarget` INTEGER NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `pointsAwarded` INTEGER NOT NULL DEFAULT 0,
    `badgeAwarded` BOOLEAN NOT NULL DEFAULT false,
    `seenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `mission_progress_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `mission_progress_studentId_status_idx`(`studentId`, `status`),
    UNIQUE INDEX `mission_progress_period_unique`(`missionId`, `studentId`, `periodStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companions` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `speciesKey` VARCHAR(60) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `stage` ENUM('EGG', 'HATCHLING', 'JUVENILE', 'ADOLESCENT', 'ADULT', 'RADIANT') NOT NULL DEFAULT 'EGG',
    `mood` ENUM('SLEEPY', 'CALM', 'CONTENT', 'HAPPY', 'EXCITED', 'PROUD') NOT NULL DEFAULT 'CALM',
    `growthPoints` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `appearance` JSON NULL,
    `accessories` JSON NULL,
    `hatchedAt` DATETIME(3) NULL,
    `lastInteractionAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastStageChangeAt` DATETIME(3) NULL,
    `careStreak` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `companions_studentId_key`(`studentId`),
    INDEX `companions_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companion_events` (
    `id` VARCHAR(191) NOT NULL,
    `companionId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `description` VARCHAR(400) NOT NULL,
    `growthDelta` INTEGER NOT NULL DEFAULT 0,
    `stageBefore` ENUM('EGG', 'HATCHLING', 'JUVENILE', 'ADOLESCENT', 'ADULT', 'RADIANT') NULL,
    `stageAfter` ENUM('EGG', 'HATCHLING', 'JUVENILE', 'ADOLESCENT', 'ADULT', 'RADIANT') NULL,
    `moodBefore` ENUM('SLEEPY', 'CALM', 'CONTENT', 'HAPPY', 'EXCITED', 'PROUD') NULL,
    `moodAfter` ENUM('SLEEPY', 'CALM', 'CONTENT', 'HAPPY', 'EXCITED', 'PROUD') NULL,
    `sourceType` VARCHAR(40) NULL,
    `sourceId` VARCHAR(32) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `seenAt` DATETIME(3) NULL,

    INDEX `companion_events_companionId_occurredAt_idx`(`companionId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leaderboard_configurations` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `scope` ENUM('CLASS', 'GRADE', 'SUBJECT', 'COHORT', 'SCHOOL', 'EVENT') NOT NULL DEFAULT 'CLASS',
    `scopeId` VARCHAR(32) NULL,
    `identityMode` ENUM('REAL_NAME', 'NICKNAME', 'AVATAR_ONLY', 'ANONYMOUS_RANK') NOT NULL DEFAULT 'NICKNAME',
    `rankingMode` ENUM('POINTS', 'MASTERY_GAIN', 'ACTIVITY_COUNT', 'PERSONAL_BEST', 'COOPERATIVE_TEAM') NOT NULL DEFAULT 'PERSONAL_BEST',
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `periodDays` INTEGER NULL DEFAULT 7,
    `minParticipants` INTEGER NOT NULL DEFAULT 5,
    `showTopN` INTEGER NOT NULL DEFAULT 10,
    `allowOptOut` BOOLEAN NOT NULL DEFAULT true,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `leaderboard_configurations_schoolId_isActive_idx`(`schoolId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leaderboard_entries` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `configId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `rank` INTEGER NOT NULL,
    `previousRank` INTEGER NULL,
    `displayLabel` VARCHAR(120) NOT NULL,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `leaderboard_entries_configId_periodStart_rank_idx`(`configId`, `periodStart`, `rank`),
    INDEX `leaderboard_entries_schoolId_idx`(`schoolId`),
    UNIQUE INDEX `leaderboard_entry_period_unique`(`configId`, `studentId`, `periodStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `category` ENUM('ASSIGNMENT_NEW', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_OVERDUE', 'RECOMMENDATION_PENDING', 'RECOMMENDATION_DECIDED', 'LEARNING_PATH_APPROVED', 'ACHIEVEMENT_EARNED', 'BADGE_EARNED', 'COMPANION_MILESTONE', 'STREAK_AT_RISK', 'INACTIVITY', 'REPEATED_DIFFICULTY', 'STRONG_IMPROVEMENT', 'CONTENT_CHANGED', 'CONTENT_PROBLEM', 'ADMINISTRATIVE', 'SAFETY_REPORT', 'SUBSCRIPTION', 'SUPPORT_UPDATE', 'LEARNING_REMINDER') NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `state` ENUM('PENDING', 'DELIVERED', 'READ', 'ACTIONED', 'DISMISSED', 'SUPPRESSED') NOT NULL DEFAULT 'PENDING',
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `actionPath` VARCHAR(300) NULL,
    `actionLabel` VARCHAR(80) NULL,
    `sourceType` VARCHAR(40) NULL,
    `sourceId` VARCHAR(32) NULL,
    `groupKey` VARCHAR(120) NULL,
    `scheduledFor` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `actionedAt` DATETIME(3) NULL,
    `dismissedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `suppressedReason` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notifications_userId_state_createdAt_idx`(`userId`, `state`, `createdAt`),
    INDEX `notifications_schoolId_category_idx`(`schoolId`, `category`),
    INDEX `notifications_scheduledFor_idx`(`scheduledFor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `notificationId` VARCHAR(191) NOT NULL,
    `channel` ENUM('IN_APP', 'EMAIL', 'PUSH') NOT NULL,
    `state` ENUM('PENDING', 'DELIVERED', 'READ', 'ACTIONED', 'DISMISSED', 'SUPPRESSED') NOT NULL DEFAULT 'PENDING',
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(400) NULL,
    `providerRef` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notification_deliveries_state_channel_idx`(`state`, `channel`),
    UNIQUE INDEX `notification_deliveries_notificationId_channel_key`(`notificationId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `inAppEnabled` BOOLEAN NOT NULL DEFAULT true,
    `emailEnabled` BOOLEAN NOT NULL DEFAULT true,
    `pushEnabled` BOOLEAN NOT NULL DEFAULT false,
    `digestEnabled` BOOLEAN NOT NULL DEFAULT true,
    `digestFrequency` VARCHAR(20) NOT NULL DEFAULT 'DAILY',
    `quietHoursStart` INTEGER NULL,
    `quietHoursEnd` INTEGER NULL,
    `categoryOverrides` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_preferences_userId_key`(`userId`),
    INDEX `notification_preferences_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `name` VARCHAR(180) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `description` VARCHAR(600) NULL,
    `scopeLevel` VARCHAR(30) NOT NULL,
    `audience` JSON NOT NULL,
    `measureNotes` VARCHAR(1000) NOT NULL,
    `limitationNotes` VARCHAR(1000) NOT NULL,
    `evidenceSources` JSON NOT NULL,
    `configuration` JSON NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(32) NULL,

    INDEX `report_definitions_scopeLevel_idx`(`scopeLevel`),
    UNIQUE INDEX `report_definitions_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_exports` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `definitionId` VARCHAR(191) NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `format` ENUM('CSV', 'JSON', 'XLSX', 'PDF') NOT NULL DEFAULT 'CSV',
    `status` ENUM('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    `parameters` JSON NULL,
    `rowCount` INTEGER NULL,
    `fileName` VARCHAR(255) NULL,
    `storageKey` VARCHAR(500) NULL,
    `byteSize` INTEGER NULL,
    `failureReason` VARCHAR(600) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `downloadCount` INTEGER NOT NULL DEFAULT 0,
    `lastDownloadedAt` DATETIME(3) NULL,

    INDEX `report_exports_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `report_exports_requestedById_requestedAt_idx`(`requestedById`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_requests` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `reference` VARCHAR(24) NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `assigneeId` VARCHAR(191) NULL,
    `category` ENUM('ACCESS_ACCOUNT', 'USABILITY', 'CONTENT_ERROR', 'CONFIGURATION_REQUEST', 'DATA_REPORTING', 'PLATFORM_DEFECT', 'SECURITY_PRIVACY', 'COMMERCIAL_SUBSCRIPTION') NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'NEW',
    `subject` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `contextPath` VARCHAR(300) NULL,
    `contextData` JSON NULL,
    `firstResponseDueAt` DATETIME(3) NULL,
    `resolutionDueAt` DATETIME(3) NULL,
    `firstRespondedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `resolutionNote` TEXT NULL,
    `defectReference` VARCHAR(80) NULL,
    `escalatedAt` DATETIME(3) NULL,
    `escalatedToId` VARCHAR(32) NULL,
    `satisfactionScore` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_requests_reference_key`(`reference`),
    INDEX `support_requests_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `support_requests_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `support_requests_requesterId_createdAt_idx`(`requesterId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `isInternal` BOOLEAN NOT NULL DEFAULT false,
    `attachments` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `schoolId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorRole` ENUM('PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CURRICULUM_MANAGER', 'CONTENT_REVIEWER', 'BILLING_ADMIN', 'SUPPORT_AGENT', 'REPORT_VIEWER') NULL,
    `isImpersonation` BOOLEAN NOT NULL DEFAULT false,
    `action` VARCHAR(120) NOT NULL,
    `targetType` VARCHAR(60) NOT NULL,
    `targetId` VARCHAR(32) NULL,
    `summary` VARCHAR(500) NULL,
    `result` ENUM('SUCCESS', 'FAILURE', 'DENIED') NOT NULL DEFAULT 'SUCCESS',
    `reason` VARCHAR(500) NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(400) NULL,
    `requestId` VARCHAR(64) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_schoolId_occurredAt_idx`(`schoolId`, `occurredAt`),
    INDEX `audit_logs_organizationId_occurredAt_idx`(`organizationId`, `occurredAt`),
    INDEX `audit_logs_actorUserId_occurredAt_idx`(`actorUserId`, `occurredAt`),
    INDEX `audit_logs_action_occurredAt_idx`(`action`, `occurredAt`),
    INDEX `audit_logs_targetType_targetId_idx`(`targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_requests` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `subjectUserId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `kind` ENUM('EXPORT', 'DELETION', 'CORRECTION') NOT NULL,
    `status` ENUM('REQUESTED', 'IN_REVIEW', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `details` TEXT NULL,
    `dueAt` DATETIME(3) NULL,
    `ownerUserId` VARCHAR(32) NULL,
    `exportStorageKey` VARCHAR(500) NULL,
    `outcomeNote` TEXT NULL,
    `rejectionReason` VARCHAR(600) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `data_requests_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `data_requests_subjectUserId_idx`(`subjectUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_records` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(32) NULL,
    `purpose` VARCHAR(120) NOT NULL,
    `lawfulBasis` VARCHAR(40) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `confirmedById` VARCHAR(32) NULL,
    `evidenceNote` VARCHAR(600) NULL,
    `policyVersion` VARCHAR(40) NULL,
    `effectiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `consent_records_schoolId_purpose_idx`(`schoolId`, `purpose`),
    INDEX `consent_records_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retention_policies` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(32) NULL,
    `dataClass` VARCHAR(80) NOT NULL,
    `retainMonths` INTEGER NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(600) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastRunRowCount` INTEGER NULL,
    `nextRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `retention_policies_schoolId_dataClass_key`(`schoolId`, `dataClass`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `description` VARCHAR(600) NOT NULL,
    `category` VARCHAR(60) NOT NULL,
    `defaultEnabled` BOOLEAN NOT NULL DEFAULT true,
    `isSafetyRule` BOOLEAN NOT NULL DEFAULT false,
    `configurableScopes` JSON NOT NULL,
    `includedInPlans` JSON NULL,
    `dependsOn` JSON NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `feature_definitions_key_key`(`key`),
    INDEX `feature_definitions_category_sortOrder_idx`(`category`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(500) NULL,
    `isSecret` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(32) NULL,

    UNIQUE INDEX `platform_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_runs` (
    `id` VARCHAR(191) NOT NULL,
    `jobKey` VARCHAR(120) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `itemsProcessed` INTEGER NOT NULL DEFAULT 0,
    `itemsFailed` INTEGER NOT NULL DEFAULT 0,
    `failureReason` TEXT NULL,
    `detail` JSON NULL,

    INDEX `job_runs_jobKey_startedAt_idx`(`jobKey`, `startedAt`),
    INDEX `job_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incident_records` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(24) NOT NULL,
    `schoolId` VARCHAR(32) NULL,
    `title` VARCHAR(200) NOT NULL,
    `severity` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `summary` TEXT NOT NULL,
    `impactSummary` TEXT NULL,
    `dataAffected` BOOLEAN NOT NULL DEFAULT false,
    `detectedAt` DATETIME(3) NOT NULL,
    `mitigatedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `ownerUserId` VARCHAR(32) NULL,
    `rootCause` TEXT NULL,
    `preventiveActions` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `incident_records_reference_key`(`reference`),
    INDEX `incident_records_status_severity_idx`(`status`, `severity`),
    INDEX `incident_records_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `release_notes` (
    `id` VARCHAR(191) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` TEXT NOT NULL,
    `changes` JSON NOT NULL,
    `affectsEvidenceInterpretation` BOOLEAN NOT NULL DEFAULT false,
    `audience` JSON NULL,
    `releasedAt` DATETIME(3) NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `release_notes_version_key`(`version`),
    INDEX `release_notes_releasedAt_idx`(`releasedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_logoMediaId_fkey` FOREIGN KEY (`logoMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schools` ADD CONSTRAINT `schools_activeThemeId_fkey` FOREIGN KEY (`activeThemeId`) REFERENCES `themes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `school_settings` ADD CONSTRAINT `school_settings_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_org_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `grades`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feature_entitlements` ADD CONSTRAINT `feature_entitlements_userGroupId_fkey` FOREIGN KEY (`userGroupId`) REFERENCES `user_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_logoMediaId_fkey` FOREIGN KEY (`logoMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_faviconMediaId_fkey` FOREIGN KEY (`faviconMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `theme_versions` ADD CONSTRAINT `theme_versions_themeId_fkey` FOREIGN KEY (`themeId`) REFERENCES `themes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_avatarMediaId_fkey` FOREIGN KEY (`avatarMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_currentGradeId_fkey` FOREIGN KEY (`currentGradeId`) REFERENCES `grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `grades`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_acceptedById_fkey` FOREIGN KEY (`acceptedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_group_members` ADD CONSTRAINT `user_group_members_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `user_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_group_members` ADD CONSTRAINT `user_group_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grades` ADD CONSTRAINT `grades_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academic_terms` ADD CONSTRAINT `academic_terms_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `grades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_academicTermId_fkey` FOREIGN KEY (`academicTermId`) REFERENCES `academic_terms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_subjects` ADD CONSTRAINT `class_subjects_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_memberships` ADD CONSTRAINT `class_memberships_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_memberships` ADD CONSTRAINT `class_memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `class_teachers_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `curriculum_programs` ADD CONSTRAINT `curriculum_programs_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `curriculum_programs` ADD CONSTRAINT `curriculum_programs_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `curriculum_programs` ADD CONSTRAINT `curriculum_programs_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `curriculum_programs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_prerequisites` ADD CONSTRAINT `topic_prerequisites_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_prerequisites` ADD CONSTRAINT `topic_prerequisites_requiredTopicId_fkey` FOREIGN KEY (`requiredTopicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_objectives` ADD CONSTRAINT `learning_objectives_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_heroMediaId_fkey` FOREIGN KEY (`heroMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_sections` ADD CONSTRAINT `lesson_sections_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_sections` ADD CONSTRAINT `lesson_sections_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_thumbnailMediaId_fkey` FOREIGN KEY (`thumbnailMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_versions` ADD CONSTRAINT `activity_versions_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_objectives` ADD CONSTRAINT `activity_objectives_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_objectives` ADD CONSTRAINT `activity_objectives_objectiveId_fkey` FOREIGN KEY (`objectiveId`) REFERENCES `learning_objectives`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_objectiveId_fkey` FOREIGN KEY (`objectiveId`) REFERENCES `learning_objectives`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_promptMediaId_fkey` FOREIGN KEY (`promptMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer_options` ADD CONSTRAINT `answer_options_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer_options` ADD CONSTRAINT `answer_options_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hints` ADD CONSTRAINT `hints_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_ownership_records` ADD CONSTRAINT `content_ownership_records_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_publications` ADD CONSTRAINT `content_publications_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_publications` ADD CONSTRAINT `content_publications_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_publications` ADD CONSTRAINT `content_publications_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_moderation_reviews` ADD CONSTRAINT `content_moderation_reviews_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `content_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_moderation_reviews` ADD CONSTRAINT `content_moderation_reviews_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_items` ADD CONSTRAINT `assessment_items_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_items` ADD CONSTRAINT `assessment_items_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_activityVersionId_fkey` FOREIGN KEY (`activityVersionId`) REFERENCES `activity_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_responses` ADD CONSTRAINT `student_responses_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `assessment_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_responses` ADD CONSTRAINT `student_responses_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_responses` ADD CONSTRAINT `student_responses_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_responses` ADD CONSTRAINT `student_responses_activityVersionId_fkey` FOREIGN KEY (`activityVersionId`) REFERENCES `activity_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_evaluations` ADD CONSTRAINT `topic_evaluations_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_evaluations` ADD CONSTRAINT `topic_evaluations_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_evaluations` ADD CONSTRAINT `topic_evaluations_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topic_evaluations` ADD CONSTRAINT `topic_evaluations_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `assessment_attempts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_paths` ADD CONSTRAINT `learning_paths_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_paths` ADD CONSTRAINT `learning_paths_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_paths` ADD CONSTRAINT `learning_paths_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_items` ADD CONSTRAINT `learning_path_items_pathId_fkey` FOREIGN KEY (`pathId`) REFERENCES `learning_paths`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_items` ADD CONSTRAINT `learning_path_items_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_items` ADD CONSTRAINT `learning_path_items_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_items` ADD CONSTRAINT `learning_path_items_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_items` ADD CONSTRAINT `learning_path_items_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_pathId_fkey` FOREIGN KEY (`pathId`) REFERENCES `learning_paths`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `assessment_attempts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mastery_records` ADD CONSTRAINT `mastery_records_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mastery_records` ADD CONSTRAINT `mastery_records_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mastery_records` ADD CONSTRAINT `mastery_records_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mastery_records` ADD CONSTRAINT `mastery_records_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mastery_records` ADD CONSTRAINT `mastery_records_objectiveId_fkey` FOREIGN KEY (`objectiveId`) REFERENCES `learning_objectives`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_assessments` ADD CONSTRAINT `teacher_assessments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_assessments` ADD CONSTRAINT `teacher_assessments_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_assessments` ADD CONSTRAINT `teacher_assessments_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_assessments` ADD CONSTRAINT `teacher_assessments_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_assessments` ADD CONSTRAINT `teacher_assessments_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_notes` ADD CONSTRAINT `teacher_notes_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_notes` ADD CONSTRAINT `teacher_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teacher_notes` ADD CONSTRAINT `teacher_notes_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `academic_terms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `activities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `assessments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_targets` ADD CONSTRAINT `assignment_targets_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_attempts` ADD CONSTRAINT `assignment_attempts_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_attempts` ADD CONSTRAINT `assignment_attempts_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assignment_attempts` ADD CONSTRAINT `assignment_attempts_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `points_ledger` ADD CONSTRAINT `points_ledger_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `points_ledger` ADD CONSTRAINT `points_ledger_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badges` ADD CONSTRAINT `badges_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badges` ADD CONSTRAINT `badges_iconMediaId_fkey` FOREIGN KEY (`iconMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_badges` ADD CONSTRAINT `student_badges_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_badges` ADD CONSTRAINT `student_badges_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_badges` ADD CONSTRAINT `student_badges_badgeId_fkey` FOREIGN KEY (`badgeId`) REFERENCES `badges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `streaks` ADD CONSTRAINT `streaks_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `streaks` ADD CONSTRAINT `streaks_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rewards` ADD CONSTRAINT `rewards_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rewards` ADD CONSTRAINT `rewards_previewMediaId_fkey` FOREIGN KEY (`previewMediaId`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_rewards` ADD CONSTRAINT `student_rewards_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_rewards` ADD CONSTRAINT `student_rewards_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_rewards` ADD CONSTRAINT `student_rewards_rewardId_fkey` FOREIGN KEY (`rewardId`) REFERENCES `rewards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `missions` ADD CONSTRAINT `missions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `missions` ADD CONSTRAINT `missions_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `missions` ADD CONSTRAINT `missions_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `missions` ADD CONSTRAINT `missions_rewardBadgeId_fkey` FOREIGN KEY (`rewardBadgeId`) REFERENCES `badges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mission_progress` ADD CONSTRAINT `mission_progress_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mission_progress` ADD CONSTRAINT `mission_progress_missionId_fkey` FOREIGN KEY (`missionId`) REFERENCES `missions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mission_progress` ADD CONSTRAINT `mission_progress_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companions` ADD CONSTRAINT `companions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companions` ADD CONSTRAINT `companions_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companion_events` ADD CONSTRAINT `companion_events_companionId_fkey` FOREIGN KEY (`companionId`) REFERENCES `companions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaderboard_configurations` ADD CONSTRAINT `leaderboard_configurations_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaderboard_entries` ADD CONSTRAINT `leaderboard_entries_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaderboard_entries` ADD CONSTRAINT `leaderboard_entries_configId_fkey` FOREIGN KEY (`configId`) REFERENCES `leaderboard_configurations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaderboard_entries` ADD CONSTRAINT `leaderboard_entries_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_definitions` ADD CONSTRAINT `report_definitions_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_exports` ADD CONSTRAINT `report_exports_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_exports` ADD CONSTRAINT `report_exports_definitionId_fkey` FOREIGN KEY (`definitionId`) REFERENCES `report_definitions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_exports` ADD CONSTRAINT `report_exports_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_requests` ADD CONSTRAINT `support_requests_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_requests` ADD CONSTRAINT `support_requests_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_requests` ADD CONSTRAINT `support_requests_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `support_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_requests` ADD CONSTRAINT `data_requests_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_requests` ADD CONSTRAINT `data_requests_subjectUserId_fkey` FOREIGN KEY (`subjectUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_requests` ADD CONSTRAINT `data_requests_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

