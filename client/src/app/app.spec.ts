import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { App } from './app';
import { AuthService } from './services/auth.service';

describe('App', () => {
  // Logged-out user, so no service ever reaches for the Supabase client.
  const auth = {
    currentUser: signal(null),
    currentProfile: signal(null),
    isAuthenticated: signal(false),
    authInitialized: signal(true),
    getSupabaseClient: () => ({}),
    signOut: vi.fn(),
  };

  beforeEach(async () => {
    auth.isAuthenticated.set(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: SwUpdate, useValue: { isEnabled: false } },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hides the loader and the nav when logged out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.loading-overlay')).toBeNull();
    expect(el.querySelector('.app-nav')).toBeNull();
  });

  it('shows Today, Log, Sleep and Settings in the nav when logged in', async () => {
    auth.isAuthenticated.set(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.app-nav .nav-link span'),
    ).map((span) => span.textContent?.trim());
    expect(labels).toEqual(['Today', 'Log', 'Sleep', 'Settings']);
  });
});
