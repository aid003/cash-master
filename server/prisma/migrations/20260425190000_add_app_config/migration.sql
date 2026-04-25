CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL,
    "undetectableApiHost" TEXT,
    "undetectableApiPort" INTEGER,
    "undetectableLastCheckedAt" TIMESTAMP(3),
    "undetectableLastCheckOk" BOOLEAN,
    "undetectableLastCheckError" TEXT,
    "undetectableLastProfileCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
