import type { ByteString, Context, Hash, Iso8601, UUID } from "../types.js";

export type Backup = {
	userId: UUID,
	pubkey: ByteString,
	updatedAt: Iso8601,
	payload: ByteString,
}

export type BackupSummary = {
	userId: UUID,
	updatedAt: Iso8601,
}

export interface FileStorage {
	getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<BackupSummary[]>;
	getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup>;
	saveUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID, backup: Backup): Promise<void>;
	deleteUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<void>;
}

