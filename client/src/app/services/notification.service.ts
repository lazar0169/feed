import { Injectable, inject, effect } from '@angular/core';
import { FeedingService } from './feeding.service';
import { SettingsService } from './settings.service';
import { AuthService } from './auth.service';
import { SleepService } from './sleep.service';
import { formatDuration } from '../utils/duration';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private feedingService = inject(FeedingService);
  private settingsService = inject(SettingsService);
  private authService = inject(AuthService);
  private sleepService = inject(SleepService);

  private nextFeedingTimer: any = null;
  private wakeWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private notificationPermission: NotificationPermission = 'default';
  private lastNotificationTime: number | null = null; // Track when we last sent a notification

  constructor() {
    // Check if browser supports notifications
    if ('Notification' in window) {
      this.notificationPermission = Notification.permission;
    }

    // Watch for changes in feeding entries or settings
    effect(() => {
      const user = this.authService.currentUser();
      const settings = this.settingsService.settings();
      // Must read the signal (not getAllEntries()) so a new feed reschedules.
      this.feedingService.entries();

      if (user && settings) {
        this.scheduleNextNotification();
      }
    });

    effect(() => {
      const user = this.authService.currentUser();
      const settings = this.settingsService.settings();
      this.sleepService.sessions();

      if (user && settings) {
        this.scheduleWakeWindowNotification();
      } else {
        this.clearWakeWindowTimer();
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

    // Get the latest entry by actual feeding time (date + time)
    const latestEntry = entries.reduce((latest, entry) => {
      const entryDateTime = new Date(`${entry.date}T${entry.time}`).getTime();
      const latestDateTime = new Date(`${latest.date}T${latest.time}`).getTime();
      return entryDateTime > latestDateTime ? entry : latest;
    });

    // Calculate when the next feeding should be based on actual feeding time
    const lastFeedingDateTime = new Date(`${latestEntry.date}T${latestEntry.time}`).getTime();
    const nextFeedingTime = lastFeedingDateTime + (intervalHours * 60 * 60 * 1000);
    const now = Date.now();
    const timeUntilNextFeeding = nextFeedingTime - now;

    if (timeUntilNextFeeding > 0) {
      // Schedule notification for future
      this.nextFeedingTimer = setTimeout(() => {
        this.showNotification(nextFeedingTime);
      }, timeUntilNextFeeding);
    } else {
      // The feeding time has passed - only show notification if we haven't already shown one for this feeding time
      if (this.lastNotificationTime === null || this.lastNotificationTime < nextFeedingTime) {
        this.showNotification(nextFeedingTime);
      }
    }
  }

  /**
   * Notify once the baby has been awake for the configured wake window.
   * Only future reminders are scheduled: one that is already past when the
   * app opens is stale, unlike an overdue feed.
   */
  private scheduleWakeWindowNotification(): void {
    this.clearWakeWindowTimer();

    const minutes = this.settingsService.getWakeWindowMinutes();
    const lastWakeAt = this.sleepService.getLastWakeAt();
    if (minutes === null || lastWakeAt === null || !this.canNotify()) return;

    const delay = lastWakeAt + minutes * 60 * 1000 - Date.now();
    if (delay <= 0) return;

    this.wakeWindowTimer = setTimeout(() => {
      this.wakeWindowTimer = null;
      if (!this.canNotify() || this.sleepService.activeSession()) return;
      this.show('😴 Wake Window', {
        body: `Awake for ${formatDuration(minutes * 60 * 1000)}. Watch for sleepy cues.`,
        tag: 'wake-window-reminder',
      });
    }, delay);
  }

  private clearWakeWindowTimer(): void {
    if (this.wakeWindowTimer) {
      clearTimeout(this.wakeWindowTimer);
      this.wakeWindowTimer = null;
    }
  }

  /** Permission granted and the notifications toggle is on. */
  private canNotify(): boolean {
    return (
      'Notification' in window &&
      this.notificationPermission === 'granted' &&
      this.settingsService.areNotificationsEnabled()
    );
  }

  private show(title: string, options: NotificationOptions): void {
    try {
      const notification = new Notification(title, { icon: '/favicon.ico', ...options });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Show a feeding reminder notification
   */
  private showNotification(nextFeedingTime: number): void {
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

      // Mark this notification time so we don't spam
      this.lastNotificationTime = nextFeedingTime;

      // DO NOT schedule another notification here - it will be scheduled when a new feeding is added
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

    // Find the entry with the latest actual feeding time (date + time)
    const latestEntry = entries.reduce((latest, entry) => {
      const entryDateTime = new Date(`${entry.date}T${entry.time}`).getTime();
      const latestDateTime = new Date(`${latest.date}T${latest.time}`).getTime();
      return entryDateTime > latestDateTime ? entry : latest;
    });

    // Calculate next feeding time based on actual feeding time
    const lastFeedingDateTime = new Date(`${latestEntry.date}T${latestEntry.time}`).getTime();
    const nextFeedingTime = lastFeedingDateTime + (intervalHours * 60 * 60 * 1000);
    const now = Date.now();
    const timeUntil = nextFeedingTime - now;

    // Return negative values for overdue feedings
    return timeUntil;
  }

  /**
   * Clean up timers on service destruction
   */
  ngOnDestroy(): void {
    if (this.nextFeedingTimer) {
      clearTimeout(this.nextFeedingTimer);
    }
    this.clearWakeWindowTimer();
  }
}
