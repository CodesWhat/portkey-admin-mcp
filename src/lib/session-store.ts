/**
 * Session management for HTTP transport
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * Session entry stored in the session store
 */
export interface SessionEntry {
	/** The transport instance for this session */
	transport: Transport;
	/** Timestamp when the session was created */
	createdAt: number;
	/** Timestamp of last activity on this session */
	lastActivity: number;
}

/**
 * Session store for managing HTTP transport sessions
 * Provides storage, retrieval, and cleanup of session data
 */
export class SessionStore {
	private sessions: Map<string, SessionEntry>;

	constructor() {
		this.sessions = new Map();
	}

	/**
	 * Get a session by ID
	 * @param sessionId - The session identifier
	 * @returns The session entry or undefined if not found
	 */
	get(sessionId: string): SessionEntry | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * Get a transport by session ID
	 * @param sessionId - The session identifier
	 * @returns The transport or undefined if not found
	 */
	getTransport(sessionId: string): Transport | undefined {
		return this.sessions.get(sessionId)?.transport;
	}

	/**
	 * Store a session
	 * @param sessionId - The session identifier
	 * @param entry - The session entry to store
	 */
	set(sessionId: string, entry: SessionEntry): void {
		this.sessions.set(sessionId, entry);
	}

	/**
	 * Delete a session by ID
	 * @param sessionId - The session identifier
	 * @returns true if the session was deleted, false if not found
	 */
	delete(sessionId: string): boolean {
		return this.sessions.delete(sessionId);
	}

	/**
	 * Check if a session exists
	 * @param sessionId - The session identifier
	 * @returns true if the session exists
	 */
	has(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	/**
	 * Get the number of active sessions
	 * @returns The session count
	 */
	get size(): number {
		return this.sessions.size;
	}

	/**
	 * Update the last activity timestamp for a session
	 * @param sessionId - The session identifier
	 */
	touch(sessionId: string): void {
		const entry = this.sessions.get(sessionId);
		if (entry) {
			entry.lastActivity = Date.now();
		}
	}

	/**
	 * Helper to close a transport and collect its promise
	 * @param transport - The transport to close
	 * @param closePromises - Array to collect close promises
	 */
	private closeTransport(
		transport: Transport,
		closePromises: Promise<void>[],
	): void {
		try {
			const closeResult = transport.close?.();
			if (closeResult instanceof Promise) {
				closePromises.push(closeResult);
			}
		} catch {
			// Ignore errors during close
		}
	}

	/**
	 * Clean up expired sessions based on max age
	 * @param maxAge - Maximum age in milliseconds before session expires
	 * @returns Array of session IDs that were cleaned up
	 */
	async cleanup(maxAge: number): Promise<string[]> {
		const now = Date.now();
		const expiredIds: string[] = [];

		for (const [sessionId, entry] of this.sessions) {
			if (now - entry.lastActivity > maxAge) {
				expiredIds.push(sessionId);
			}
		}

		const closePromises: Promise<void>[] = [];
		for (const sessionId of expiredIds) {
			const entry = this.sessions.get(sessionId);
			if (entry) {
				this.closeTransport(entry.transport, closePromises);
				this.sessions.delete(sessionId);
			}
		}

		// Wait for all transports to close
		await Promise.allSettled(closePromises);
		return expiredIds;
	}

	/**
	 * Close all sessions and clear the store
	 */
	async closeAll(): Promise<void> {
		const closePromises: Promise<void>[] = [];

		for (const [_sessionId, entry] of this.sessions) {
			this.closeTransport(entry.transport, closePromises);
		}

		// Wait for all transports to close
		await Promise.allSettled(closePromises);

		this.sessions.clear();
	}

	/**
	 * Get all session IDs
	 * @returns Array of session IDs
	 */
	getAllSessionIds(): string[] {
		return Array.from(this.sessions.keys());
	}
}
