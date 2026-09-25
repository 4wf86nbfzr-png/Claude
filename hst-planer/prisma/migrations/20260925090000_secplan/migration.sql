-- CreateEnum
CREATE TYPE "DocumentAccess" AS ENUM ('PERSONAL_INTERN', 'DISPOSITION', 'EINSATZBEZOGEN', 'MITARBEITER', 'KUNDE', 'PARTNER');

-- CreateEnum
CREATE TYPE "ApplicantStatus" AS ENUM ('EINGEGANGEN', 'IN_PRUEFUNG', 'GESPRAECH', 'ZUSAGE', 'ABSAGE', 'UEBERNOMMEN');

-- CreateEnum
CREATE TYPE "TrainingResult" AS ENUM ('ANGEMELDET', 'TEILGENOMMEN', 'BESTANDEN', 'NICHT_BESTANDEN', 'ABGEMELDET');

-- CreateEnum
CREATE TYPE "ZugriffsErgebnis" AS ENUM ('GEWAEHRT', 'VERWEIGERT');

-- CreateEnum
CREATE TYPE "RechtsgrundlageArt" AS ENUM ('ART6_1A_EINWILLIGUNG', 'ART6_1B_VERTRAG', 'ART6_1C_RECHTLICHE_PFLICHT', 'ART6_1D_LEBENSWICHTIG', 'ART6_1E_OEFFENTLICHES_INTERESSE', 'ART6_1F_BERECHTIGTES_INTERESSE', 'PARA26_BDSG_BESCHAEFTIGUNG', 'OFFEN');

-- CreateEnum
CREATE TYPE "PruefStatus" AS ENUM ('ENTWURF', 'IN_PRUEFUNG', 'TECHNISCH_UMGESETZT', 'RECHTLICH_GEPRUEFT', 'UEBERHOLT');

-- CreateEnum
CREATE TYPE "AvvStatus" AS ENUM ('NICHT_VORHANDEN', 'ENTWURF', 'UNTERZEICHNET', 'GEKUENDIGT');

-- CreateEnum
CREATE TYPE "BetroffenenRecht" AS ENUM ('AUSKUNFT', 'BERICHTIGUNG', 'LOESCHUNG', 'EINSCHRAENKUNG', 'DATENUEBERTRAGBARKEIT', 'WIDERSPRUCH', 'WIDERRUF_EINWILLIGUNG');

-- CreateEnum
CREATE TYPE "AnfrageStatus" AS ENUM ('EINGEGANGEN', 'IDENTITAET_PRUEFEN', 'IN_BEARBEITUNG', 'BEANTWORTET', 'ABGELEHNT', 'FRIST_UEBERSCHRITTEN');

-- CreateEnum
CREATE TYPE "VorfallStatus" AS ENUM ('ENTDECKT', 'IN_BEWERTUNG', 'GEMELDET', 'ABGESCHLOSSEN', 'KEINE_MELDUNG');

-- CreateEnum
CREATE TYPE "DsfaErgebnis" AS ENUM ('NICHT_ERFORDERLICH', 'ERFORDERLICH', 'DURCHGEFUEHRT', 'OFFEN');

-- CreateEnum
CREATE TYPE "TomBereich" AS ENUM ('ZUTRITT', 'ZUGANG', 'ZUGRIFF', 'WEITERGABE', 'EINGABE', 'AUFTRAG', 'VERFUEGBARKEIT', 'TRENNUNG', 'VERSCHLUESSELUNG', 'BELASTBARKEIT', 'WIEDERHERSTELLUNG', 'UEBERPRUEFUNG');

-- CreateEnum
CREATE TYPE "TomStatus" AS ENUM ('GEPLANT', 'TECHNISCH_UMGESETZT', 'ORGANISATORISCH_GEREGELT', 'NICHT_UMGESETZT');

-- CreateEnum
CREATE TYPE "ComplianceDocKind" AS ENUM ('RICHTLINIE', 'VERFAHRENSANWEISUNG', 'EINWILLIGUNG', 'INFORMATIONSPFLICHT', 'VERPFLICHTUNG', 'SCHULUNGSUNTERLAGE', 'NACHWEIS', 'SONSTIGES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'ARBEITSVERTRAG';
ALTER TYPE "DocumentType" ADD VALUE 'BEWERBUNG';
ALTER TYPE "DocumentType" ADD VALUE 'COMPLIANCE';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SUPERADMIN', 'GESCHAEFTSFUEHRUNG', 'PERSONAL', 'DISPOSITION', 'EINSATZLEITUNG', 'TEAMLEITUNG', 'MITARBEITER', 'KUNDE', 'SUBUNTERNEHMER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MITARBEITER';
COMMIT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "access" "DocumentAccess" NOT NULL DEFAULT 'PERSONAL_INTERN',
ADD COLUMN     "deleteAt" TIMESTAMP(3),
ADD COLUMN     "retentionRuleId" TEXT,
ADD COLUMN     "specialCategory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "objektId" TEXT;

-- CreateTable
CREATE TABLE "Applicant" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "source" TEXT,
    "position" TEXT,
    "status" "ApplicantStatus" NOT NULL DEFAULT 'EINGEGANGEN',
    "note" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "employeeId" TEXT,
    "deleteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objekt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "customerId" TEXT,
    "leadId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "serviceNote" TEXT,
    "notesInternal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Objekt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "qualificationId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "seats" INTEGER,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "repeatMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingParticipant" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "result" "TrainingResult" NOT NULL DEFAULT 'ANGEMELDET',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSensitive" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "lawfulBasis" TEXT,
    "validUntil" TIMESTAMP(3),
    "deleteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "EmployeeSensitive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role",
    "action" TEXT NOT NULL,
    "result" "ZugriffsErgebnis" NOT NULL DEFAULT 'GEWAEHRT',
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role",
    "bereich" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filter" TEXT,
    "purpose" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingActivity" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawfulBasis" "RechtsgrundlageArt" NOT NULL DEFAULT 'OFFEN',
    "lawfulBasisNote" TEXT,
    "dataSubjects" TEXT NOT NULL,
    "dataCategories" TEXT NOT NULL,
    "specialCategory" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT,
    "thirdCountry" TEXT,
    "retention" TEXT NOT NULL,
    "tomSummary" TEXT,
    "responsible" TEXT,
    "status" "PruefStatus" NOT NULL DEFAULT 'ENTWURF',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "ProcessingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Processor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "thirdCountry" BOOLEAN NOT NULL DEFAULT false,
    "transferBasis" TEXT,
    "avvStatus" "AvvStatus" NOT NULL DEFAULT 'NICHT_VORHANDEN',
    "avvSignedAt" TIMESTAMP(3),
    "avvUntil" TIMESTAMP(3),
    "contactEmail" TEXT,
    "subProcessors" TEXT,
    "personalData" BOOLEAN NOT NULL DEFAULT true,
    "aiSystem" BOOLEAN NOT NULL DEFAULT false,
    "aiTrainingUse" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "Processor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessorLink" (
    "id" TEXT NOT NULL,
    "processorId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "ProcessorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRule" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lawfulBasis" "RechtsgrundlageArt" NOT NULL DEFAULT 'OFFEN',
    "keepReason" TEXT,
    "months" INTEGER NOT NULL,
    "startsFrom" TEXT NOT NULL,
    "responsible" TEXT,
    "status" "PruefStatus" NOT NULL DEFAULT 'ENTWURF',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RetentionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "right" "BetroffenenRecht" NOT NULL,
    "status" "AnfrageStatus" NOT NULL DEFAULT 'EINGEGANGEN',
    "subjectName" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "employeeId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedTo" TIMESTAMP(3),
    "identityCheckedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "description" TEXT NOT NULL,
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataBreach" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VorfallStatus" NOT NULL DEFAULT 'ENTDECKT',
    "noticedAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "affectedData" TEXT NOT NULL,
    "affectedCount" INTEGER,
    "measures" TEXT,
    "reportable" BOOLEAN,
    "reportableNote" TEXT,
    "assessedBy" TEXT,
    "assessedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "authority" TEXT,
    "subjectsInformedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "DataBreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dpia" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activityId" TEXT,
    "necessity" "DsfaErgebnis" NOT NULL DEFAULT 'OFFEN',
    "necessityNote" TEXT,
    "risks" TEXT,
    "measures" TEXT,
    "residualRisk" TEXT,
    "status" "PruefStatus" NOT NULL DEFAULT 'ENTWURF',
    "consultedDpo" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Dpia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TomMeasure" (
    "id" TEXT NOT NULL,
    "bereich" "TomBereich" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TomStatus" NOT NULL DEFAULT 'GEPLANT',
    "evidence" TEXT,
    "responsible" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TomMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "kind" "ComplianceDocKind" NOT NULL DEFAULT 'SONSTIGES',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" "PruefStatus" NOT NULL DEFAULT 'ENTWURF',
    "author" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Applicant_status_deletedAt_idx" ON "Applicant"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Applicant_lastName_firstName_idx" ON "Applicant"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Objekt_active_deletedAt_idx" ON "Objekt"("active", "deletedAt");

-- CreateIndex
CREATE INDEX "Objekt_customerId_idx" ON "Objekt"("customerId");

-- CreateIndex
CREATE INDEX "Training_startsAt_idx" ON "Training"("startsAt");

-- CreateIndex
CREATE INDEX "TrainingParticipant_employeeId_idx" ON "TrainingParticipant"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingParticipant_trainingId_employeeId_key" ON "TrainingParticipant"("trainingId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSensitive_employeeId_idx" ON "EmployeeSensitive"("employeeId");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_documentId_createdAt_idx" ON "DocumentAccessLog"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_userId_createdAt_idx" ON "DocumentAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentToken_tokenHash_key" ON "DocumentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentToken_documentId_idx" ON "DocumentToken"("documentId");

-- CreateIndex
CREATE INDEX "DocumentToken_expiresAt_idx" ON "DocumentToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ExportLog_userId_createdAt_idx" ON "ExportLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportLog_bereich_createdAt_idx" ON "ExportLog"("bereich", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingActivity_number_key" ON "ProcessingActivity"("number");

-- CreateIndex
CREATE INDEX "ProcessingActivity_status_idx" ON "ProcessingActivity"("status");

-- CreateIndex
CREATE INDEX "Processor_avvStatus_idx" ON "Processor"("avvStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessorLink_processorId_activityId_key" ON "ProcessorLink"("processorId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRule_category_key" ON "RetentionRule"("category");

-- CreateIndex
CREATE INDEX "RetentionRule_status_idx" ON "RetentionRule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DataSubjectRequest_number_key" ON "DataSubjectRequest"("number");

-- CreateIndex
CREATE INDEX "DataSubjectRequest_status_dueAt_idx" ON "DataSubjectRequest"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataBreach_number_key" ON "DataBreach"("number");

-- CreateIndex
CREATE INDEX "DataBreach_status_noticedAt_idx" ON "DataBreach"("status", "noticedAt");

-- CreateIndex
CREATE INDEX "TomMeasure_bereich_idx" ON "TomMeasure"("bereich");

-- CreateIndex
CREATE INDEX "ComplianceDocument_kind_status_idx" ON "ComplianceDocument"("kind", "status");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "Objekt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_retentionRuleId_fkey" FOREIGN KEY ("retentionRuleId") REFERENCES "RetentionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objekt" ADD CONSTRAINT "Objekt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingParticipant" ADD CONSTRAINT "TrainingParticipant_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessorLink" ADD CONSTRAINT "ProcessorLink_processorId_fkey" FOREIGN KEY ("processorId") REFERENCES "Processor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessorLink" ADD CONSTRAINT "ProcessorLink_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProcessingActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

