import { Component, Signal, inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { LoginComponent } from './features/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  imports: [LoginComponent, DashboardComponent],
  templateUrl: './app.html',
})
export class App {
  private readonly authService = inject(AuthService);

  readonly loggedIn: Signal<boolean> = this.authService.loggedIn;
}
