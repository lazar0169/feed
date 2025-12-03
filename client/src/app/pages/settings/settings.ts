import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  protected settingsService = inject(SettingsService);
  protected notificationService = inject(NotificationService);

  // Local state for form
  protected intervalEnabled = signal<boolean>(true);
  protected intervalHours = signal<number>(3);
  protected notificationsToggleEnabled = signal<boolean>(true);
  protected isSaving = signal<boolean>(false);
  protected saveMessage = signal<string>('');

  // Notification state
  protected notificationsSupported = signal<boolean>(false);
  protected notificationPermission = signal<NotificationPermission>('default');

  // Computed: check if notifications are fully enabled
  protected notificationsEnabled = computed(() => {
    return this.notificationPermission() === 'granted' && this.intervalEnabled();
  });

  ngOnInit(): void {
    // Initialize form with current settings
    const currentInterval = this.settingsService.getFeedingInterval();
    if (currentInterval === null) {
      this.intervalEnabled.set(false);
      this.intervalHours.set(this.settingsService.getDefaultInterval());
    } else {
      this.intervalEnabled.set(true);
      this.intervalHours.set(currentInterval);
    }

    // Initialize notifications toggle
    this.notificationsToggleEnabled.set(this.settingsService.areNotificationsEnabled());

    // Check notification support and permission
    this.notificationsSupported.set('Notification' in window);
    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    }
  }

  protected async onSave(): Promise<void> {
    this.isSaving.set(true);
    this.saveMessage.set('');

    const intervalValue = this.intervalEnabled() ? this.intervalHours() : null;
    const intervalSuccess = await this.settingsService.updateFeedingInterval(intervalValue);
    const notificationsSuccess = await this.settingsService.updateNotificationsEnabled(this.notificationsToggleEnabled());

    this.isSaving.set(false);

    if (!intervalSuccess || !notificationsSuccess) {
      this.saveMessage.set('Failed to save settings. Please try again.');
      setTimeout(() => this.saveMessage.set(''), 5000);
      return;
    }

    // Request notification permission if enabling notifications
    if (this.intervalEnabled() && this.notificationsToggleEnabled() && this.notificationsSupported()) {
      const hasPermission = await this.notificationService.requestPermission();
      this.notificationPermission.set(Notification.permission);

      if (!hasPermission && this.notificationPermission() !== 'granted') {
        this.saveMessage.set('Settings saved, but notifications are blocked. Enable them in your browser settings.');
        setTimeout(() => this.saveMessage.set(''), 5000);
        return;
      }
    }

    // Success message
    this.saveMessage.set('Settings saved successfully!');
    setTimeout(() => this.saveMessage.set(''), 3000);
  }

  protected onToggleInterval(enabled: boolean): void {
    this.intervalEnabled.set(enabled);
  }

  protected onIntervalChange(hours: number): void {
    // Ensure the value is positive and reasonable (0.5 to 24 hours)
    if (hours < 0.5) hours = 0.5;
    if (hours > 24) hours = 24;
    this.intervalHours.set(hours);
  }

  protected onToggleNotifications(enabled: boolean): void {
    this.notificationsToggleEnabled.set(enabled);
  }

  protected async testNotification(): Promise<void> {
    const success = await this.notificationService.testNotification();

    // Update permission state after test
    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    }

    // Show feedback message
    if (success && this.notificationPermission() === 'granted') {
      this.saveMessage.set('Test notification sent! If you don\'t see it, check your browser\'s notification settings or system Do Not Disturb mode.');
      setTimeout(() => this.saveMessage.set(''), 5000);
    } else if (this.notificationPermission() === 'denied') {
      this.saveMessage.set('Notifications are blocked. Please enable them in your browser settings (usually in the address bar).');
      setTimeout(() => this.saveMessage.set(''), 5000);
    } else if (this.notificationPermission() === 'default') {
      this.saveMessage.set('Please allow notifications when prompted by your browser.');
      setTimeout(() => this.saveMessage.set(''), 5000);
    } else {
      this.saveMessage.set('Failed to send notification. Please try again or check your browser settings.');
      setTimeout(() => this.saveMessage.set(''), 5000);
    }
  }

  protected getNotificationStatusText(): string {
    if (!this.notificationsSupported()) {
      return 'Browser notifications are not supported on this device.';
    }

    const permission = this.notificationPermission();
    if (permission === 'granted') {
      return this.intervalEnabled()
        ? '✓ Notifications enabled and working'
        : 'Enable interval to receive notifications';
    } else if (permission === 'denied') {
      return '✗ Notifications blocked by browser';
    } else {
      return 'Click "Save Settings" to enable notifications';
    }
  }
}
