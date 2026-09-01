-- AlterTable
ALTER TABLE `school_settings` ADD COLUMN `allowedPathModes` JSON NULL,
    ADD COLUMN `attemptLimitByAgeMode` JSON NULL,
    ADD COLUMN `companionStageThresholds` JSON NULL,
    ADD COLUMN `confidenceThresholdHigh` INTEGER NOT NULL DEFAULT 8,
    ADD COLUMN `confidenceThresholdModerate` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `defaultShuffleItems` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `streakDefaultFreezes` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `streakMaxFreezes` INTEGER NULL,
    ADD COLUMN `streakWeekendsCount` BOOLEAN NOT NULL DEFAULT true;

