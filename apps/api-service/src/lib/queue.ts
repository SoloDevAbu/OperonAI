import { createBullMQRedisClient } from "@operonai/lib";
import { createInvestigationQueue } from "@operonai/queue";

const redisClient = createBullMQRedisClient();

export const investigationQueue = createInvestigationQueue(redisClient);

export const closeQueue = async (): Promise<void> => {
  await investigationQueue.close();
  await redisClient.quit();
};
