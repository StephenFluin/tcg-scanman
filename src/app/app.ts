import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <header>
      <h1>TCG ScanMan</h1>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [
    `
      header {
        background: #cc0000;
        color: white;
        padding: 1rem;
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
      }
    `,
  ],
})
export class App {
  protected readonly title = signal('tcg-scanman');
}
