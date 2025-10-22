-- CreateTable
CREATE TABLE "TrelloConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "boardId" TEXT,
    "boardName" TEXT,
    "listId" TEXT,
    "listName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TrelloConfig_shop_key" ON "TrelloConfig"("shop");
