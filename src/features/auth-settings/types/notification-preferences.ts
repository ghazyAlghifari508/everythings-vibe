export interface NotificationPreferences {
	id: string;
	userId: string;
	quotaWarning: boolean;
	prdCompleted: boolean;
	paymentUpdates: boolean;
	productUpdates: boolean;
	createdAt: Date | null;
	updatedAt: Date | null;
}
