import { Component, signal, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  resetForm: FormGroup;
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  hasValidToken = signal<boolean>(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  async ngOnInit(): Promise<void> {
    // Wait a bit for auth state to update from URL hash
    setTimeout(async () => {
      const session = await this.authService.getSession();

      if (!session || !session.user) {
        this.errorMessage.set('Invalid or expired reset link. Please request a new one.');
        this.hasValidToken.set(false);
      } else {
        this.hasValidToken.set(true);
      }
    }, 500);
  }

  protected async onResetPassword(): Promise<void> {
    if (this.resetForm.invalid) {
      this.errorMessage.set('Please fill in all fields correctly');
      return;
    }

    const { password, confirmPassword } = this.resetForm.value;
    if (password !== confirmPassword) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const result = await this.authService.updatePassword(password);

    this.isLoading.set(false);

    if (result.success) {
      this.successMessage.set('Password updated successfully! Redirecting to login...');
      this.resetForm.reset();

      // Wait 2 seconds then redirect
      setTimeout(() => {
        this.authService.signOut();
      }, 2000);
    } else {
      this.errorMessage.set(result.error || 'Failed to update password. Please try again.');
    }
  }

  protected goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
