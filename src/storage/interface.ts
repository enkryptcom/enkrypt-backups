import type { ByteString, Context, Hash, Iso8601, UUID } from "../types.js";

export type Backup = {
	userId: UUID,
	pubkey: ByteString,
	updatedAt: Iso8601,
	payload: ByteString,
}

export interface FileStorage {
	getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<null | Backup[]>;
	getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup>;
	saveUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID, backup: Backup): Promise<void>;
}

