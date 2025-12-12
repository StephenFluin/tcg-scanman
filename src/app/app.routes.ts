import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/scanner.page').then((m) => m.ScannerPage),
  },
];
