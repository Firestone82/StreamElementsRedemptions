import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Protects dashboard routes: sends anonymous visitors to the login screen. */
export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  return authService.loggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** Protects the login route: sends already-connected visitors to the dashboard. */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  return authService.loggedIn() ? inject(Router).createUrlTree(['/']) : true;
};
