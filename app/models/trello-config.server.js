import prisma from "../db.server";

export function getTrelloConfigForShop(shop) {
  return prisma.trelloConfig.findUnique({ where: { shop } });
}

export function upsertTrelloToken({ shop, token }) {
  return prisma.trelloConfig.upsert({
    where: { shop },
    update: { token },
    create: { shop, token },
  });
}

export function updateTrelloSelection({ shop, boardId, boardName, listId, listName }) {
  return prisma.trelloConfig.update({
    where: { shop },
    data: {
      boardId,
      boardName,
      listId,
      listName,
    },
  });
}

export function clearTrelloSelection(shop) {
  return prisma.trelloConfig.update({
    where: { shop },
    data: {
      boardId: null,
      boardName: null,
      listId: null,
      listName: null,
    },
  });
}
