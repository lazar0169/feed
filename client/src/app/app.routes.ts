import { Routes } from '@angular/router';
import { Today } from './pages/today/today';
import { authGuard } from './guards/auth.guard';

// Today is the landing page so it stays eager; the rest are lazy chunks
// (ngsw-config prefetches /*.js, so they still work offline).
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    redirectTo: '/today',
    pathMatch: 'full',
  },
  {
    path: 'today',
    component: Today,
    canActivate: [authGuard],
  },
  {
    path: 'log',
    loadComponent: () => import('./pages/log/log').then((m) => m.Log),
    canActivate: [authGuard],
  },
  {
    path: 'sleep',
    loadComponent: () => import('./pages/sleep/sleep').then((m) => m.Sleep),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '/login' },
];
