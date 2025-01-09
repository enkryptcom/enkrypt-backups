
export const ClusterPrimaryMessage = {
	BEGIN_GRACEFUL_SHUTDOWN: 'BEGIN_GRACEFUL_SHUTDOWN',
	BEGIN_FORCEFUL_SHUTDOWN: 'BEGIN_FORCEFUL_SHUTDOWN',
} as const
export type ClusterPrimaryMessage =
	| { type: typeof ClusterPrimaryMessage.BEGIN_GRACEFUL_SHUTDOWN }
	| { type: typeof ClusterPrimaryMessage.BEGIN_FORCEFUL_SHUTDOWN }

/** Messages sent by cluster worker processes to the cluster primary process */
export const ClusterWorkerMessage = {
	READY: 'READY',
} as const
export type ClusterWorkerMessage =
	| { type: typeof ClusterWorkerMessage.READY }

