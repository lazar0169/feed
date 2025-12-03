import { Injectable, inject, effect } from '@angular/core';
import { FeedingService } from './feeding.service';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private feedingService = inject(FeedingService);
  private settingsService = inject(SettingsService);
  private authService = inject(AuthService);

  private nextFeedingTimer: any = null;
  private notificationPermission: NotificationPermission = 'default';

  constructor() {
    // Check if browser supports notifications
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission;
    }

    // Watch for changes in feeding entries or settings
    effect(() => {
      const user = this.authService.currentUser();
      const settings = this.settingsService.settings();
      const entries = this.feedingService.getAllEntries();

      if (user && settings) {
        this.scheduleNextNotification();
      }
    });
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (this.notificationPermission === 'granted') {
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled and permitted
   */
  isNotificationEnabled(): boolean {
    return (
      'Notification' in window &&
      this.notificationPermission === 'granted' &&
      this.settingsService.isFeedingIntervalEnabled() &&
      this.settingsService.areNotificationsEnabled()
    );
  }

  /**
   * Calculate and schedule the next feeding notification
   */
  private scheduleNextNotification(): void {
    // Clear any existing timer
    if (this.nextFeedingTimer) {
      clearTimeout(this.nextFeedingTimer);
      this.nextFeedingTimer = null;
    }

    // Check if notifications are enabled
    if (!this.isNotificationEnabled()) {
      return;
    }

    const intervalHours = this.settingsService.getFeedingInterval();
    if (intervalHours === null) {
      return;
    }

    // Get the most recent feeding entry
    const entries = this.feedingService.getAllEntries();
    if (entries.length === 0) {
      // No entries yet, don't schedule notification
      return;
    }

    // Get the latest entry by timestamp
    const latestEntry = entries.reduce((latest, entry) =>
      entry.timestamp > latest.timestamp ? entry : latest
    );

    // Calculate when the next feeding should be
    const nextFeedingTime = latestEntry.timestamp + (intervalHours * 60 * 60 * 1000);
    const now = Date.now();
    const timeUntilNextFeeding = nextFeedingTime - now;

    if (timeUntilNextFeeding > 0) {
      // Schedule notification
      this.nextFeedingTimer = setTimeout(() => {
        this.showNotification();
      }, timeUntilNextFeeding);

      console.log(`Next feeding notification scheduled in ${Math.round(timeUntilNextFeeding / 1000 / 60)} minutes`);
    } else {
      // The next feeding time has already passed, show notification now
      this.showNotification();
    }
  }

  /**
   * Show a feeding reminder notification
   */
  private showNotification(): void {
    if (!this.isNotificationEnabled()) {
      return;
    }

    const intervalHours = this.settingsService.getFeedingInterval();
    const title = '🍼 Feeding Reminder';
    const body = `It's been ${intervalHours} hour${intervalHours !== 1 ? 's' : ''} since the last feeding. Time to feed your baby!`;

    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'feeding-reminder',
        requireInteraction: true, // Keep notification until user interacts
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Schedule the next notification (recurring)
      this.scheduleNextNotification();
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Manually trigger a test notification
   */
  async testNotification(): Promise<boolean> {
    const hasPermission = await this.requestPermission();

    if (!hasPermission) {
      return false;
    }

    try {
      const notification = new Notification('🍼 Test Notification', {
        body: 'Notifications are working! You will receive reminders based on your feeding interval.',
        tag: 'test-notification',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return true;
    } catch (error) {
      console.error('Error showing test notification:', error);
      return false;
    }
  }

  /**
   * Get time until next notification in milliseconds
   * Returns null if no notification is scheduled
   */
  getTimeUntilNextNotification(): number | null {
    const intervalHours = this.settingsService.getFeedingInterval();
    if (intervalHours === null) {
      return null;
    }

    const entries = this.feedingService.getAllEntries();
    if (entries.length === 0) {
      return null;
    }

    const latestEntry = entries.reduce((latest, entry) =>
      entry.timestamp > latest.timestamp ? entry : latest
    );

    const nextFeedingTime = latestEntry.timestamp + (intervalHours * 60 * 60 * 1000);
    const now = Date.now();
    const timeUntil = nextFeedingTime - now;

    return timeUntil > 0 ? timeUntil : 0;
  }

  /**
   * Clean up timers on service destruction
   */
  ngOnDestroy(): void {
    if (this.nextFeedingTimer) {
      clearTimeout(this.nextFeedingTimer);
    }
  }
}
