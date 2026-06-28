import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';

export const routes: Routes = [
  { path: 'items/:id', component: DashboardComponent },
  { path: '', component: DashboardComponent },
  { path: '**', redirectTo: '' },
];
