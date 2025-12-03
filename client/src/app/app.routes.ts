import { Routes } from '@angular/router';
import { Today } from './pages/today/today';
import { Log } from './pages/log/log';
import { Statistics } from './pages/statistics/statistics';

export const routes: Routes = [
  { path: '', redirectTo: '/today', pathMatch: 'full' },
  { path: 'today', component: Today },
  { path: 'log', component: Log },
  { path: 'statistics', component: Statistics },
  { path: '**', redirectTo: '/today' }
];
