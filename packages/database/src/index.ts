import { PrismaClient, Prisma } from '@prisma/client';
export { PrismaClient, Prisma };
export type Tx = Prisma.TransactionClient;
export interface UnitOfWork {
  read<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  write<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
/** SQLite local, single-process serialization. DB constraints remain the integrity backstop. */
export class Database implements UnitOfWork {
  readonly client: PrismaClient;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(url: string) {
    if (!url.startsWith('file:')) throw new Error('SQLITE_FILE_REQUIRED');
    this.client = new PrismaClient({datasourceUrl:url,log:[]});
  }
  read<T>(work: (tx: Tx) => Promise<T>): Promise<T> { return this.write(work); }
  write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.client.$transaction(work,{maxWait:10000,timeout:10000}));
    this.queue = result.catch(() => undefined);
    return result;
  }
  async close() { await this.queue; await this.client.$disconnect(); }
}
