import { Routes } from '@angular/router';
import { Today } from './pages/today/today';
import { Log } from './pages/log/log';
import { Statistics } from './pages/statistics/statistics';
import { Login } from './pages/login/login';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
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
  { path: '**', redirectTo: '/login' }
];
