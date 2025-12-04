import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // Modern Angular: Use inject() instead of constructor injection
  protected authService = inject(AuthService);
  private router = inject(Router);
  private notificationService = inject(NotificationService); // Initialize notification service

  title = 'Baby Feeding Tracker';

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
    // Register service worker for PWA
    this.registerServiceWorker();
  }

  private registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then((registration) => {
            console.log('ServiceWorker registration successful:', registration.scope);
          })
          .catch((error) => {
            console.log('ServiceWorker registration failed:', error);
          });
      });
    }
  }

  protected async logout(): Promise<void> {
    await this.authService.signOut();
  }
}
