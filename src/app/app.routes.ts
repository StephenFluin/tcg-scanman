import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/scanner/scanner.component').then((m) => m.ScannerComponent),
  },
];
