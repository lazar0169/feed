import { Injectable, signal, effect } from '@angular/core';
import { AuthService } from './auth.service';

export interface UserSettings {
  id?: string;
  user_id: string;
  feeding_interval_hours: number | null; // null means disabled
  notifications_enabled: boolean; // whether to show browser notifications
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  // Signal to store current settings
  public settings = signal<UserSettings | null>(null);

  // Loading state signal
  public isLoading = signal<boolean>(false);

  // Default interval is 3 hours
  private readonly DEFAULT_INTERVAL_HOURS = 3;

  constructor(private authService: AuthService) {
    // Watch for user changes and load settings
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.loadSettings();
      } else {
        this.settings.set(null);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Load user settings from Supabase
   */
  async loadSettings(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    this.isLoading.set(true);

    try {
      const supabase = this.authService.getSupabaseClient();
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no settings exist, create default settings
        if (error.code === 'PGRST116') {
          await this.createDefaultSettings();
          return;
        }
        throw error;
      }

      this.settings.set(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Create default settings for the user
   */
  private async createDefaultSettings(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    try {
      const supabase = this.authService.getSupabaseClient();
      const defaultSettings: Partial<UserSettings> = {
        user_id: user.id,
        feeding_interval_hours: this.DEFAULT_INTERVAL_HOURS,
        notifications_enabled: true
      };

      const { data, error } = await supabase
        .from('user_settings')
        .insert(defaultSettings)
        .select()
        .single();

      if (error) throw error;

      this.settings.set(data);
    } catch (error) {
      console.error('Error creating default settings:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Update feeding interval setting
   * @param hours - Number of hours for interval, or null to disable
   */
  async updateFeedingInterval(hours: number | null): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const supabase = this.authService.getSupabaseClient();
      const currentSettings = this.settings();

      if (!currentSettings?.id) {
        // Create new settings if they don't exist
        const { data, error } = await supabase
          .from('user_settings')
          .insert({
            user_id: user.id,
            feeding_interval_hours: hours,
            notifications_enabled: true
          })
          .select()
          .single();

        if (error) throw error;
        this.settings.set(data);
      } else {
        // Update existing settings
        const { data, error } = await supabase
          .from('user_settings')
          .update({ feeding_interval_hours: hours })
          .eq('id', currentSettings.id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        this.settings.set(data);
      }

      return true;
    } catch (error) {
      console.error('Error updating feeding interval:', error);
      return false;
    }
  }

  /**
   * Update notifications enabled setting
   * @param enabled - Whether to enable browser notifications
   */
  async updateNotificationsEnabled(enabled: boolean): Promise<boolean> {
    const user = this.authService.currentUser();
    if (!user) return false;

    try {
      const supabase = this.authService.getSupabaseClient();
      const currentSettings = this.settings();

      if (!currentSettings?.id) {
        // Create new settings if they don't exist
        const { data, error } = await supabase
          .from('user_settings')
          .insert({
            user_id: user.id,
            feeding_interval_hours: this.DEFAULT_INTERVAL_HOURS,
            notifications_enabled: enabled
          })
          .select()
          .single();

        if (error) throw error;
        this.settings.set(data);
      } else {
        // Update existing settings
        const { data, error } = await supabase
          .from('user_settings')
          .update({ notifications_enabled: enabled })
          .eq('id', currentSettings.id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        this.settings.set(data);
      }

      return true;
    } catch (error) {
      console.error('Error updating notifications enabled:', error);
      return false;
    }
  }

  /**
   * Get the current feeding interval in hours
   * Returns null if disabled
   */
  getFeedingInterval(): number | null {
    const settings = this.settings();
    if (!settings) {
      return this.DEFAULT_INTERVAL_HOURS;
    }
    return settings.feeding_interval_hours;
  }

  /**
   * Check if feeding interval is enabled
   */
  isFeedingIntervalEnabled(): boolean {
    return this.getFeedingInterval() !== null;
  }

  /**
   * Get the default interval hours
   */
  getDefaultInterval(): number {
    return this.DEFAULT_INTERVAL_HOURS;
  }

  /**
   * Check if notifications are enabled
   */
  areNotificationsEnabled(): boolean {
    return this.settings()?.notifications_enabled ?? true;
  }
}
