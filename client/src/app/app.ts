import { Component, inject, computed, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, filter } from 'rxjs/operators';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // Modern Angular: Use inject() instead of constructor injection
  protected authService = inject(AuthService);
  private router = inject(Router);
  private notificationService = inject(NotificationService); // Initialize notification service
  private swUpdate = inject(SwUpdate);

  title = 'Baby Feeding Tracker';

  // Update notification state
  protected showUpdateBanner = signal<boolean>(false);

  // Convert router events to signal
  private currentUrl = toSignal(
    this.router.events.pipe(
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  // Computed signal for navigation visibility
  protected showNavigation = computed(() => {
    const url = this.currentUrl();
    const hideOnPages = ['/login', '/reset-password'];
    return this.authService.isAuthenticated() && !hideOnPages.includes(url);
  });

  constructor() {
    // Check for service worker updates
    this.checkForUpdates();
  }

  private checkForUpdates(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    // Listen for available updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY')
      )
      .subscribe(() => {
        this.showUpdateBanner.set(true);
      });

    // Check for updates on app load
    this.swUpdate.checkForUpdate();

    // Check for updates every 6 hours
    setInterval(() => {
      this.swUpdate.checkForUpdate();
    }, 6 * 60 * 60 * 1000);
  }

  protected activateUpdate(): void {
    this.showUpdateBanner.set(false);
    window.location.reload();
  }

  protected dismissUpdate(): void {
    this.showUpdateBanner.set(false);
  }

  protected async logout(): Promise<void> {
    await this.authService.signOut();
  }
}
