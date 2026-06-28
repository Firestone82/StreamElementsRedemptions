import { Component, Signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { LoginComponent } from './features/login/login.component';

@Component({
  selector: 'app-root',
  imports: [LoginComponent, RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  private readonly authService = inject(AuthService);

  readonly loggedIn: Signal<boolean> = this.authService.loggedIn;
}
