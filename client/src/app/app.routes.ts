import { Routes } from '@angular/router';
import { Today } from './pages/today/today';
import { Log } from './pages/log/log';
import { Statistics } from './pages/statistics/statistics';
import { Settings } from './pages/settings/settings';
import { Login } from './pages/login/login';
import { ResetPassword } from './pages/reset-password/reset-password';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'reset-password', component: ResetPassword },
  {
    path: '',
    redirectTo: '/today',
    pathMatch: 'full'
  },
  {
    path: 'today',
    component: Today,
    canActivate: [authGuard]
  },
  {
    path: 'log',
    component: Log,
    canActivate: [authGuard]
  },
  {
    path: 'statistics',
    component: Statistics,
    canActivate: [authGuard]
  },
  {
    path: 'settings',
    component: Settings,
    canActivate: [authGuard]
  },
  { path: '**', redirectTo: '/login' }
];
