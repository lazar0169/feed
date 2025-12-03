import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  loginForm: FormGroup;
  signupForm: FormGroup;
  forgotPasswordForm: FormGroup;
  isSignupMode = signal<boolean>(false);
  isForgotPasswordMode = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    // Check if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/today']);
    }

    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.signupForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });

    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  protected toggleMode(): void {
    this.isSignupMode.set(!this.isSignupMode());
    this.isForgotPasswordMode.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.loginForm.reset();
    this.signupForm.reset();
    this.forgotPasswordForm.reset();
  }

  protected showForgotPassword(): void {
    this.isForgotPasswordMode.set(true);
    this.isSignupMode.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.forgotPasswordForm.reset();
  }

  protected backToLogin(): void {
    this.isForgotPasswordMode.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  protected async onLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      this.errorMessage.set('Please fill in all fields correctly');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { username, password } = this.loginForm.value;
    const result = await this.authService.signIn(username, password);

    this.isLoading.set(false);

    if (!result.success) {
      this.errorMessage.set(result.error || 'Login failed. Please try again.');
    }
  }

  protected async onSignup(): Promise<void> {
    if (this.signupForm.invalid) {
      this.errorMessage.set('Please fill in all fields correctly');
      return;
    }

    const { password, confirmPassword } = this.signupForm.value;
    if (password !== confirmPassword) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { username, email } = this.signupForm.value;
    const result = await this.authService.signUp(username, email, password);

    this.isLoading.set(false);

    if (result.success) {
      this.errorMessage.set('');
      this.isSignupMode.set(false);
      this.loginForm.patchValue({ username, password });
      // Auto-login after signup
      await this.onLogin();
    } else {
      this.errorMessage.set(result.error || 'Signup failed. Please try again.');
    }
  }

  protected async onForgotPassword(): Promise<void> {
    if (this.forgotPasswordForm.invalid) {
      this.errorMessage.set('Please enter a valid email');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const { email } = this.forgotPasswordForm.value;
    const result = await this.authService.resetPassword(email);

    this.isLoading.set(false);

    if (result.success) {
      this.successMessage.set('Password reset email sent! Check your inbox.');
      this.forgotPasswordForm.reset();
    } else {
      this.errorMessage.set(result.error || 'Failed to send reset email. Please try again.');
    }
  }
}
